import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { executeWorkflowGraph, type WorkflowExecutionResult } from '../src/server/execution/engine';
import { EXECUTION_FAILURE_FINALIZATION_TIMEOUT_MS, EXECUTION_FINALIZATION_TIMEOUT_MS } from '../src/server/execution/persistence-timeout';
import { checkWorkflowActivation } from '../src/server/workflows/activation';
import { workflowGraphSchema } from '../src/server/workflows/graph-validation';
import { isScheduleDue, nearestUtcMidnight, parseScheduleConfig } from '../src/server/workflows/schedule-config';
import {
  handleScheduleTick,
  isAuthorizedCronRequest,
  MAX_ACTIVE_SCHEDULED_WORKFLOWS,
  resolveScheduleSlot,
  type ScheduleExecutionStore,
} from '../src/server/workflows/schedule-trigger-core';
import { describeSchedule } from '../src/components/workflow/schedule-summary';

const SECRET = 'test-cron-secret-0123456789';
const NODE_ID = 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0001';
const OWNER_ID = 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0020';
// Wednesday 2026-10-07, 00:23 UTC — a typical Hobby tick inside the 00:00–00:59 window.
const TICK = new Date('2026-10-07T00:23:00.000Z');
const SLOT = '2026-10-07T00:00:00.000Z';

const workflowId = (index: number) => `c18b6c07-750c-4be1-a1e0-${String(index).padStart(12, '0')}`;
const scheduleGraph = (config: Record<string, unknown> = { frequency: 'daily' }, category = 'schedule_trigger') => ({
  nodes: [{ id: NODE_ID, type: 'trigger', category, label: 'Schedule', position: { x: 0, y: 0 }, config }],
  connections: [],
});

function tickRequest(secret: string | null = SECRET, method = 'GET') {
  return new Request('https://flowpilot.test/api/internal/schedule-tick', {
    method,
    headers: secret === null ? {} : { authorization: `Bearer ${secret}` },
  });
}

const completed: WorkflowExecutionResult = { status: 'completed', logs: [] };

function memoryStore(workflowCount = 1, graphFor: (id: string) => unknown = () => scheduleGraph()) {
  const claimed = new Map<string, string>();
  const finished: string[] = [];
  const store: ScheduleExecutionStore = {
    listActiveScheduledWorkflows: async (limit) =>
      Array.from({ length: Math.min(limit, workflowCount) }, (_, index) => ({ id: workflowId(index + 1), ownerId: OWNER_ID })),
    loadGraph: async (id) => graphFor(id) as { nodes: unknown[]; connections: unknown[] },
    claimExecution: async (id, scheduledAt) => {
      const key = `${id}|${scheduledAt.toISOString()}`;
      if (claimed.has(key)) return null;
      const executionId = workflowId(1000 + claimed.size);
      claimed.set(key, executionId);
      return { id: executionId };
    },
    markRunning: async () => undefined,
    appendLogs: async () => undefined,
    finishExecution: async (_id, executionId) => { finished.push(executionId); },
    failExecution: async () => undefined,
  };
  return { store, claimed, finished };
}

test('schedule config accepts daily and weekly UTC weekdays and rejects incomplete settings', () => {
  assert.deepEqual(parseScheduleConfig({ frequency: 'daily' }), { frequency: 'daily' });
  assert.deepEqual(parseScheduleConfig({ frequency: 'weekly', weekdays: [1, 3] }), { frequency: 'weekly', weekdays: [1, 3] });
  for (const invalid of [{}, { frequency: 'hourly' }, { frequency: 'weekly', weekdays: [] }, { frequency: 'weekly', weekdays: [7] }, { frequency: 'weekly', weekdays: [1, 1] }, { frequency: 'daily', weekdays: [1] }, { frequency: 'daily', cron: '* * * * *' }]) {
    assert.equal(parseScheduleConfig(invalid), null, JSON.stringify(invalid));
  }
});

test('graph validation allows partial schedule drafts but rejects unknown fields', () => {
  assert.equal(workflowGraphSchema.safeParse(scheduleGraph({})).success, true);
  assert.equal(workflowGraphSchema.safeParse(scheduleGraph({ frequency: 'weekly' })).success, true);
  assert.equal(workflowGraphSchema.safeParse(scheduleGraph({ frequency: 'daily', time: '09:00' })).success, false);
  assert.equal(workflowGraphSchema.safeParse(scheduleGraph({ frequency: 'weekly', weekdays: [9] })).success, false);
});

test('slots round to the nearest UTC midnight and reject ticks outside the Hobby window', () => {
  assert.equal(nearestUtcMidnight(TICK).toISOString(), SLOT);
  assert.equal(resolveScheduleSlot(new Date('2026-10-07T00:59:59Z'))?.toISOString(), SLOT);
  assert.equal(resolveScheduleSlot(new Date('2026-10-06T23:50:00Z'))?.toISOString(), SLOT);
  assert.equal(resolveScheduleSlot(new Date('2026-10-07T12:00:00Z')), null);
  assert.equal(resolveScheduleSlot(new Date('2026-10-06T22:00:00Z')), null);
});

test('weekly schedules are due only on selected UTC weekdays', () => {
  const wednesday = new Date(SLOT);
  assert.equal(isScheduleDue({ frequency: 'daily' }, wednesday), true);
  assert.equal(isScheduleDue({ frequency: 'weekly', weekdays: [3] }, wednesday), true);
  assert.equal(isScheduleDue({ frequency: 'weekly', weekdays: [1, 5] }, wednesday), false);
});

test('cron authorization fails closed and compares the bearer secret', () => {
  assert.equal(isAuthorizedCronRequest(tickRequest(), SECRET), true);
  assert.equal(isAuthorizedCronRequest(tickRequest('wrong-secret-0123456789'), SECRET), false);
  assert.equal(isAuthorizedCronRequest(tickRequest(null), SECRET), false);
  assert.equal(isAuthorizedCronRequest(tickRequest(''), ''), false);
  assert.equal(isAuthorizedCronRequest(tickRequest('short'), 'short'), false);
});

test('tick rejects missing configuration, bad secrets, and non-GET methods before touching storage', async () => {
  let listed = 0;
  const { store } = memoryStore();
  const counting = { ...store, listActiveScheduledWorkflows: async (limit: number) => { listed += 1; return store.listActiveScheduledWorkflows(limit); } };
  const deps = { store: counting, runGraph: async () => completed, now: () => TICK };
  assert.equal((await handleScheduleTick(tickRequest(), { ...deps, cronSecret: undefined })).status, 503);
  assert.equal((await handleScheduleTick(tickRequest('nope-nope-nope-nope'), { ...deps, cronSecret: SECRET })).status, 401);
  assert.equal((await handleScheduleTick(tickRequest(SECRET, 'POST'), { ...deps, cronSecret: SECRET })).status, 405);
  const outside = await handleScheduleTick(tickRequest(), { ...deps, cronSecret: SECRET, now: () => new Date('2026-10-07T12:00:00Z') });
  assert.equal(outside.status, 200);
  assert.deepEqual(await outside.json(), { skipped: 'outside_schedule_window' });
  assert.equal(listed, 0);
});

test('tick runs due workflows once per slot and suppresses duplicate invocations', async () => {
  const { store, finished } = memoryStore(2);
  const inputs: unknown[] = [];
  const deps = {
    store,
    cronSecret: SECRET,
    now: () => TICK,
    runGraph: async (_graph: unknown, input: Record<string, unknown>) => { inputs.push(input); return completed; },
  };
  const first = await (await handleScheduleTick(tickRequest(), deps)).json();
  assert.equal(first.slot, SLOT);
  assert.equal(first.outcomes.completed, 2);
  assert.deepEqual(inputs[0], { scheduledAt: SLOT, frequency: 'daily' });

  const second = await (await handleScheduleTick(tickRequest(), { ...deps, now: () => new Date('2026-10-07T00:40:00Z') })).json();
  assert.equal(second.outcomes.duplicate, 2);
  assert.equal(second.outcomes.completed, 0);
  assert.equal(finished.length, 2);
});

test('scheduled result writes share one bounded signal and failure recovery gets a fresh short signal', async () => {
  let logSignal: AbortSignal | undefined;
  let finishSignal: AbortSignal | undefined;
  const { store } = memoryStore();
  const success = await handleScheduleTick(tickRequest(), {
    store: {
      ...store,
      appendLogs: async (_executionId, _logs, signal) => { logSignal = signal; },
      finishExecution: async (_workflowId, _executionId, _result, _completedAt, signal) => { finishSignal = signal; },
    },
    cronSecret: SECRET,
    now: () => TICK,
    runGraph: async () => ({ ...completed, logs: [{ nodeId: NODE_ID, status: 'success', timestamp: TICK.toISOString() }] }),
  });
  assert.equal((await success.json()).outcomes.completed, 1);
  assert.ok(logSignal instanceof AbortSignal);
  assert.equal(logSignal, finishSignal);
  assert.equal(logSignal.aborted, false);
  assert.equal(EXECUTION_FINALIZATION_TIMEOUT_MS, 2_000);

  let failedLogSignal: AbortSignal | undefined;
  let recoverySignal: AbortSignal | undefined;
  const { store: failureStore } = memoryStore();
  const failed = await handleScheduleTick(tickRequest(), {
    store: {
      ...failureStore,
      appendLogs: async (_executionId, _logs, signal) => { failedLogSignal = signal; throw new Error('database details'); },
      failExecution: async (_workflowId, _executionId, signal) => { recoverySignal = signal; },
    },
    cronSecret: SECRET,
    now: () => TICK,
    runGraph: async () => ({ ...completed, logs: [{ nodeId: NODE_ID, status: 'success', timestamp: TICK.toISOString() }] }),
  });
  assert.equal((await failed.json()).outcomes.error, 1);
  assert.ok(failedLogSignal instanceof AbortSignal);
  assert.ok(recoverySignal instanceof AbortSignal);
  assert.notEqual(failedLogSignal, recoverySignal);
  assert.equal(recoverySignal.aborted, false);
  assert.equal(EXECUTION_FAILURE_FINALIZATION_TIMEOUT_MS, 1_000);
});

test('tick skips non-due, invalid, and wrong-trigger graphs without creating executions', async () => {
  const graphs: Record<string, unknown> = {
    [workflowId(1)]: scheduleGraph({ frequency: 'weekly', weekdays: [1] }),
    [workflowId(2)]: scheduleGraph({}),
    [workflowId(3)]: scheduleGraph({}, 'webhook_trigger'),
    [workflowId(4)]: { nodes: 'broken', connections: [] },
  };
  const { store, claimed } = memoryStore(4, (id) => graphs[id]);
  const summary = await (await handleScheduleTick(tickRequest(), { store, cronSecret: SECRET, now: () => TICK, runGraph: async () => completed })).json();
  assert.equal(summary.outcomes.not_due, 1);
  assert.equal(summary.outcomes.invalid, 3);
  assert.equal(claimed.size, 0);
});

test('tick is bounded to the active-workflow cap and the concurrency limit', async () => {
  const { store } = memoryStore(MAX_ACTIVE_SCHEDULED_WORKFLOWS + 10);
  let running = 0;
  let peak = 0;
  const summary = await (await handleScheduleTick(tickRequest(), {
    store,
    cronSecret: SECRET,
    now: () => TICK,
    concurrency: 50,
    runGraph: async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 2));
      running -= 1;
      return completed;
    },
  })).json();
  assert.equal(summary.considered, MAX_ACTIVE_SCHEDULED_WORKFLOWS);
  assert.equal(summary.outcomes.completed, MAX_ACTIVE_SCHEDULED_WORKFLOWS);
  assert.equal(peak <= 5, true);
});

test('a failing run is marked failed without aborting the rest of the tick', async () => {
  const { store } = memoryStore(3);
  const failed: string[] = [];
  let calls = 0;
  const summary = await (await handleScheduleTick(tickRequest(), {
    store: { ...store, failExecution: async (_id, executionId) => { failed.push(executionId); } },
    cronSecret: SECRET,
    now: () => TICK,
    concurrency: 1,
    runGraph: async () => { calls += 1; if (calls === 2) throw new Error('boom'); return completed; },
  })).json();
  assert.equal(summary.outcomes.completed, 2);
  assert.equal(summary.outcomes.error, 1);
  assert.equal(failed.length, 1);
});

test('engine runs a schedule-trigger graph only when the schedule trigger is required', async () => {
  const graph = workflowGraphSchema.parse(scheduleGraph());
  const ok = await executeWorkflowGraph(graph, { scheduledAt: SLOT }, { triggerCategory: 'schedule_trigger' });
  assert.equal(ok.status, 'completed');
  const manual = await executeWorkflowGraph(graph, {}, {});
  assert.equal(manual.status, 'failed');
  assert.equal(manual.error, 'A single Manual Trigger is required to run this workflow.');
});

test('activation accepts webhook and complete schedule graphs and enforces scheduling capacity', async () => {
  const none = async () => 0;
  assert.deepEqual(await checkWorkflowActivation(scheduleGraph({}, 'webhook_trigger'), none), { ok: true, trigger: 'webhook_trigger' });
  assert.deepEqual(await checkWorkflowActivation(scheduleGraph(), none), { ok: true, trigger: 'schedule_trigger' });
  assert.equal((await checkWorkflowActivation(scheduleGraph({}, 'manual_trigger'), none)).ok, false);
  const incomplete = await checkWorkflowActivation(scheduleGraph({ frequency: 'weekly' }), none);
  assert.equal(incomplete.ok === false && incomplete.status, 422);
  const full = await checkWorkflowActivation(scheduleGraph(), async () => MAX_ACTIVE_SCHEDULED_WORKFLOWS);
  assert.equal(full.ok === false && full.status, 409);
  let counted = false;
  await checkWorkflowActivation(scheduleGraph({}, 'webhook_trigger'), async () => { counted = true; return 0; });
  assert.equal(counted, false);
});

test('schedule summaries describe complete configs for the editor', () => {
  assert.equal(describeSchedule({ frequency: 'daily' }), 'Every day (UTC)');
  assert.equal(describeSchedule({ frequency: 'weekly', weekdays: [5, 1] }), 'Weekly on Mon, Fri (UTC)');
  assert.equal(describeSchedule({ frequency: 'weekly', weekdays: [] }), null);
  assert.equal(describeSchedule({}), null);
});
