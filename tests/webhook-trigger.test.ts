import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createWebhookToken } from '../src/server/workflows/webhook-token';
import { webhookBodySchema } from '../src/server/workflows/webhook-validation';
import { EXECUTION_FAILURE_FINALIZATION_TIMEOUT_MS, EXECUTION_FINALIZATION_TIMEOUT_MS } from '../src/server/execution/persistence-timeout';
import { handleWebhookRequest, type WebhookExecutionStore } from '../src/server/workflows/webhook-trigger-core';
import type { WorkflowExecutionResult } from '../src/server/execution/engine';

const token = 'a'.repeat(43);
const graph = (category: 'webhook_trigger' | 'manual_trigger' = 'webhook_trigger') => ({
  nodes: [{ id: 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0001', type: 'trigger', category, label: 'Trigger', position: { x: 0, y: 0 }, config: {} }],
  connections: [],
});

function request(body: unknown, method = 'POST') {
  return new Request(`https://flowpilot.test/api/hooks/${token}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: JSON.stringify(body) }),
  });
}

function store(overrides: Partial<WebhookExecutionStore> = {}): WebhookExecutionStore {
  return {
    findActiveWorkflow: async () => ({ id: 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0010', ownerId: 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0020' }),
    loadGraph: async () => graph(),
    createExecution: async () => ({ id: 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0030' }),
    markRunning: async () => undefined,
    appendLogs: async () => undefined,
    finishExecution: async () => undefined,
    failExecution: async () => undefined,
    ...overrides,
  };
}

const completed: WorkflowExecutionResult = {
  status: 'completed',
  logs: [{ nodeId: 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0001', status: 'success', timestamp: new Date().toISOString(), outputData: { started: true } }],
};

test('webhook tokens are URL-safe, bounded, and independently generated', () => {
  const first = createWebhookToken();
  const second = createWebhookToken();
  assert.equal(first.length, 43);
  assert.equal(/^[A-Za-z0-9_-]+$/.test(first), true);
  assert.notEqual(first, second);
});

test('webhook body schema accepts objects and rejects arrays and scalar values', () => {
  assert.equal(webhookBodySchema.safeParse({ event: 'created' }).success, true);
  assert.equal(webhookBodySchema.safeParse([]).success, false);
  assert.equal(webhookBodySchema.safeParse('payload').success, false);
  assert.equal(webhookBodySchema.safeParse(null).success, false);
});

test('webhook handler executes a valid active graph and persists only summarized input', async () => {
  let triggerData: Record<string, unknown> | undefined;
  const response = await handleWebhookRequest(request({ secret: 'do-not-persist', event: 'created' }), token, {
    store: store({ createExecution: async (_workflowId, data) => { triggerData = data; return { id: 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0030' }; } }),
    runGraph: async () => completed,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(triggerData, { received: true, topLevelFieldCount: 2 });
  assert.equal(await response.text().then((body) => body.includes('do-not-persist')), false);
});

test('webhook result writes share one bounded signal and failure recovery gets a fresh short signal', async () => {
  let logSignal: AbortSignal | undefined;
  let finishSignal: AbortSignal | undefined;
  const success = await handleWebhookRequest(request({ event: 'created' }), token, {
    store: store({
      appendLogs: async (_executionId, _logs, signal) => { logSignal = signal; },
      finishExecution: async (_workflowId, _executionId, _result, _completedAt, signal) => { finishSignal = signal; },
    }),
    runGraph: async () => completed,
  });
  assert.equal(success.status, 200);
  assert.ok(logSignal instanceof AbortSignal);
  assert.equal(logSignal, finishSignal);
  assert.equal(logSignal.aborted, false);
  assert.equal(EXECUTION_FINALIZATION_TIMEOUT_MS, 2_000);

  let failedLogSignal: AbortSignal | undefined;
  let recoverySignal: AbortSignal | undefined;
  const failed = await handleWebhookRequest(request({ event: 'created' }), token, {
    store: store({
      appendLogs: async (_executionId, _logs, signal) => { failedLogSignal = signal; throw new Error('database details'); },
      failExecution: async (_workflowId, _executionId, signal) => { recoverySignal = signal; },
    }),
    runGraph: async () => completed,
  });
  assert.equal(failed.status, 503);
  assert.ok(failedLogSignal instanceof AbortSignal);
  assert.ok(recoverySignal instanceof AbortSignal);
  assert.notEqual(failedLogSignal, recoverySignal);
  assert.equal(recoverySignal.aborted, false);
  assert.equal(EXECUTION_FAILURE_FINALIZATION_TIMEOUT_MS, 1_000);
});

test('unknown, malformed, inactive, and wrong-trigger tokens do not reveal token state', async () => {
  const unknown = await handleWebhookRequest(request({}), 'not-found', { store: store({ findActiveWorkflow: async () => null }) });
  const malformed = await handleWebhookRequest(request({}), '!', { store: store({ findActiveWorkflow: async () => null }) });
  const tooLong = await handleWebhookRequest(request({}), 'x'.repeat(65), { store: store() });
  const wrongTrigger = await handleWebhookRequest(request({}), token, { store: store({ loadGraph: async () => graph('manual_trigger') }) });
  for (const response of [unknown, malformed, tooLong, wrongTrigger]) {
    assert.equal(response.status, 404);
    const body = await response.text();
    assert.equal(body.includes(token), false);
    assert.equal(body.includes('not-found'), false);
  }
});

test('malformed, non-object, and oversized bodies fail before execution persistence', async () => {
  let creates = 0;
  const base = store({ createExecution: async () => { creates += 1; return { id: 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0030' }; } });
  const malformed = await handleWebhookRequest(new Request('https://flowpilot.test/api/hooks/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }), token, { store: base });
  const scalar = await handleWebhookRequest(request('scalar'), token, { store: base });
  const oversized = await handleWebhookRequest(request({ payload: 'x'.repeat(17_000) }), token, { store: base });
  assert.equal(malformed.status, 400);
  assert.equal(scalar.status, 400);
  assert.equal(oversized.status, 413);
  assert.equal(creates, 0);
});

test('unsupported methods are rejected and persistence failures return generic responses', async () => {
  const method = await handleWebhookRequest(request({}, 'GET'), token, { store: store() });
  assert.equal(method.status, 405);
  const failed = await handleWebhookRequest(request({ event: 'created' }), token, {
    store: store({ markRunning: async () => { throw new Error('database detail must stay private'); } }),
  });
  assert.equal(failed.status, 503);
  assert.equal((await failed.text()).includes('database detail'), false);
});
