import { createHash, timingSafeEqual } from 'node:crypto';
import { jsonResponse } from '../auth/http';
import type { WorkflowExecutionResult } from '../execution/engine';
import type { SafeExecutionLog } from '../execution/logging';
import { workflowGraphSchema, type WorkflowGraphInput } from './graph-validation';
import { isScheduleDue, nearestUtcMidnight, parseScheduleConfig, type ScheduleTriggerConfig } from './schedule-config';

/** Deployment-wide cap so one daily tick stays inside a single bounded serverless invocation. */
export const MAX_ACTIVE_SCHEDULED_WORKFLOWS = 25;
/** Concurrent runs per tick: 25 workflows / 5 lanes x 8 s engine budget ≈ 40 s worst case. */
export const SCHEDULE_TICK_CONCURRENCY = 5;
/** Accept ticks from 15 minutes before to 90 minutes after UTC midnight (Hobby fires within 00:00–00:59). */
const EARLY_WINDOW_MS = 15 * 60 * 1000;
const LATE_WINDOW_MS = 90 * 60 * 1000;
const MIN_CRON_SECRET_LENGTH = 16;

type ScheduledWorkflow = { id: string; ownerId: string };
type LoadedGraph = { nodes: unknown[]; connections: unknown[] };

export interface ScheduleExecutionStore {
  listActiveScheduledWorkflows: (limit: number) => Promise<ScheduledWorkflow[]>;
  loadGraph: (workflowId: string) => Promise<LoadedGraph>;
  /** Insert a pending execution for (workflowId, scheduledAt); resolve null when that slot already exists. */
  claimExecution: (workflowId: string, scheduledAt: Date, triggerData: Record<string, unknown>) => Promise<{ id: string } | null>;
  markRunning: (workflowId: string, executionId: string, startedAt: Date) => Promise<void>;
  appendLogs: (executionId: string, logs: SafeExecutionLog[]) => Promise<void>;
  finishExecution: (workflowId: string, executionId: string, result: WorkflowExecutionResult, completedAt: Date) => Promise<void>;
  failExecution: (workflowId: string, executionId: string) => Promise<void>;
}

export interface ScheduleTickDependencies {
  store: ScheduleExecutionStore;
  cronSecret: string | undefined;
  runGraph: (graph: WorkflowGraphInput, input: Record<string, unknown>, ownerId: string) => Promise<WorkflowExecutionResult>;
  now?: () => Date;
  concurrency?: number;
}

export type ScheduleRunOutcome = 'completed' | 'failed' | 'not_due' | 'duplicate' | 'invalid' | 'error';

export interface ScheduleTickSummary {
  slot: string;
  considered: number;
  outcomes: Record<ScheduleRunOutcome, number>;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Constant-time check of `Authorization: Bearer <CRON_SECRET>`; fails closed when the secret is unset or weak. */
export function isAuthorizedCronRequest(request: Request, cronSecret: string | undefined): boolean {
  if (!cronSecret || cronSecret.length < MIN_CRON_SECRET_LENGTH) return false;
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return false;
  return timingSafeEqual(digest(header.slice('Bearer '.length)), digest(cronSecret));
}

/** Returns the UTC-midnight slot for a tick, or null when the tick is outside the accepted window. */
export function resolveScheduleSlot(now: Date): Date | null {
  const slot = nearestUtcMidnight(now);
  const offset = now.getTime() - slot.getTime();
  return offset >= -EARLY_WINDOW_MS && offset <= LATE_WINDOW_MS ? slot : null;
}

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(lanes);
  return results;
}

async function runScheduledWorkflow(
  workflow: ScheduledWorkflow,
  slot: Date,
  dependencies: ScheduleTickDependencies,
): Promise<ScheduleRunOutcome> {
  const { store } = dependencies;
  let executionId: string | null = null;
  try {
    const parsedGraph = workflowGraphSchema.safeParse(await store.loadGraph(workflow.id));
    if (!parsedGraph.success || parsedGraph.data.nodes.length > 50) return 'invalid';
    const triggerNodes = parsedGraph.data.nodes.filter((node) => node.type === 'trigger');
    if (triggerNodes.length !== 1 || triggerNodes[0].category !== 'schedule_trigger') return 'invalid';
    const schedule: ScheduleTriggerConfig | null = parseScheduleConfig(triggerNodes[0].config);
    if (!schedule) return 'invalid';
    if (!isScheduleDue(schedule, slot)) return 'not_due';

    const triggerInput = { scheduledAt: slot.toISOString(), frequency: schedule.frequency };
    // Schedule metadata is non-secret, so it is persisted as-is for execution history.
    const execution = await store.claimExecution(workflow.id, slot, triggerInput);
    if (!execution) return 'duplicate';
    executionId = execution.id;

    await store.markRunning(workflow.id, execution.id, new Date());
    const result = await dependencies.runGraph(parsedGraph.data, triggerInput, workflow.ownerId);
    if (result.logs.length > 0) await store.appendLogs(execution.id, result.logs);
    await store.finishExecution(workflow.id, execution.id, result, new Date());
    return result.status;
  } catch {
    if (executionId) {
      try { await store.failExecution(workflow.id, executionId); } catch { /* keep persistence details private */ }
    }
    return 'error';
  }
}

export async function handleScheduleTick(request: Request, dependencies: ScheduleTickDependencies): Promise<Response> {
  if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
  if (!dependencies.cronSecret || dependencies.cronSecret.length < MIN_CRON_SECRET_LENGTH) {
    return jsonResponse(503, { error: 'Scheduler is not configured.' });
  }
  if (!isAuthorizedCronRequest(request, dependencies.cronSecret)) return jsonResponse(401, { error: 'Unauthorized.' });

  const now = dependencies.now?.() ?? new Date();
  const slot = resolveScheduleSlot(now);
  if (!slot) return jsonResponse(200, { skipped: 'outside_schedule_window' });

  try {
    const scheduled = await dependencies.store.listActiveScheduledWorkflows(MAX_ACTIVE_SCHEDULED_WORKFLOWS);
    const bounded = scheduled.slice(0, MAX_ACTIVE_SCHEDULED_WORKFLOWS);
    const outcomes = await runWithConcurrency(
      bounded,
      Math.min(dependencies.concurrency ?? SCHEDULE_TICK_CONCURRENCY, SCHEDULE_TICK_CONCURRENCY),
      (workflow) => runScheduledWorkflow(workflow, slot, dependencies),
    );
    const summary: ScheduleTickSummary = {
      slot: slot.toISOString(),
      considered: bounded.length,
      outcomes: { completed: 0, failed: 0, not_due: 0, duplicate: 0, invalid: 0, error: 0 },
    };
    for (const outcome of outcomes) summary.outcomes[outcome] += 1;
    return jsonResponse(200, summary);
  } catch {
    return jsonResponse(503, { error: 'Scheduler unavailable.' });
  }
}
