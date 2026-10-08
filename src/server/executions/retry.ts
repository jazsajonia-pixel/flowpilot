import { summarizeTriggerInput } from '../execution/logging';
import type { ExecutionTrigger } from './history';

export type RetryTriggerCategory = 'manual_trigger' | 'webhook_trigger' | 'schedule_trigger';

export type RetryPlan =
  | { ok: true; triggerInput: Record<string, unknown>; triggerData: Record<string, unknown> }
  | { ok: false; status: 409 | 422; error: string };

export interface RetryCandidate {
  id: string;
  status: string;
  interrupted: boolean;
  trigger: ExecutionTrigger;
  triggerData: unknown;
}

const TRIGGER_BY_CATEGORY: Record<RetryTriggerCategory, ExecutionTrigger> = {
  manual_trigger: 'manual',
  webhook_trigger: 'webhook',
  schedule_trigger: 'schedule',
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/**
 * Decide whether a run can be replayed and with which input. FlowPilot never stores raw
 * manual/webhook payloads, so only runs that received no input (or scheduled runs, whose
 * input is just the slot time and frequency) can be replayed faithfully.
 */
export function planRetry(original: RetryCandidate, currentTrigger: RetryTriggerCategory | null): RetryPlan {
  if (original.status !== 'failed' && !original.interrupted) {
    return { ok: false, status: 409, error: 'Only failed or interrupted runs can be retried.' };
  }
  if (!currentTrigger) return { ok: false, status: 422, error: 'The workflow needs exactly one trigger before it can be retried.' };
  if (original.trigger !== 'unknown' && TRIGGER_BY_CATEGORY[currentTrigger] !== original.trigger) {
    return { ok: false, status: 409, error: "The workflow's trigger changed since this run, so it can't be replayed." };
  }

  const data = record(original.triggerData);
  if (currentTrigger === 'schedule_trigger') {
    const scheduledAt = data?.scheduledAt;
    const frequency = data?.frequency;
    if (typeof scheduledAt !== 'string' || typeof frequency !== 'string' || Number.isNaN(Date.parse(scheduledAt))) {
      return { ok: false, status: 409, error: "This run's schedule details weren't stored, so it can't be replayed." };
    }
    const triggerInput = { scheduledAt, frequency };
    return { ok: true, triggerInput, triggerData: { ...triggerInput, retryOf: original.id } };
  }

  if (data?.topLevelFieldCount !== 0) {
    return { ok: false, status: 409, error: "This run's input isn't stored for privacy, so it can't be replayed. Run the workflow again instead." };
  }
  return { ok: true, triggerInput: {}, triggerData: { ...summarizeTriggerInput({}), retryOf: original.id } };
}

export function retryOfFrom(triggerData: unknown): string | null {
  const value = record(triggerData)?.retryOf;
  return typeof value === 'string' ? value : null;
}
