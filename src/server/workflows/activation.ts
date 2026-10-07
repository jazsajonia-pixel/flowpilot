import { workflowGraphSchema } from './graph-validation';
import { parseScheduleConfig } from './schedule-config';
import { MAX_ACTIVE_SCHEDULED_WORKFLOWS } from './schedule-trigger-core';

export type ActivationCheck =
  | { ok: true; trigger: 'webhook_trigger' | 'schedule_trigger' }
  | { ok: false; status: 409 | 422; error: string };

/**
 * Decide whether a saved graph may be activated.
 * `countOtherActiveScheduled` is only consulted for Schedule Trigger graphs.
 */
export async function checkWorkflowActivation(
  graph: { nodes: unknown[]; connections: unknown[] },
  countOtherActiveScheduled: () => Promise<number>,
): Promise<ActivationCheck> {
  const parsed = workflowGraphSchema.safeParse(graph);
  const triggerNodes = parsed.success ? parsed.data.nodes.filter((node) => node.type === 'trigger') : [];
  const trigger = triggerNodes.length === 1 ? triggerNodes[0] : undefined;
  if (!parsed.success || !trigger || (trigger.category !== 'webhook_trigger' && trigger.category !== 'schedule_trigger')) {
    return { ok: false, status: 422, error: 'Activate requires a valid workflow with one Webhook or Schedule Trigger.' };
  }
  if (trigger.category === 'webhook_trigger') return { ok: true, trigger: 'webhook_trigger' };

  if (!parseScheduleConfig(trigger.config)) {
    return { ok: false, status: 422, error: 'Choose Daily, or Weekly with at least one UTC weekday, before activating.' };
  }
  if (parsed.data.nodes.length > 50) {
    return { ok: false, status: 422, error: 'A scheduled run is limited to 50 workflow nodes.' };
  }
  if (await countOtherActiveScheduled() >= MAX_ACTIVE_SCHEDULED_WORKFLOWS) {
    return { ok: false, status: 409, error: `Scheduling capacity is full (${MAX_ACTIVE_SCHEDULED_WORKFLOWS} active scheduled workflows). Deactivate another scheduled workflow first.` };
  }
  return { ok: true, trigger: 'schedule_trigger' };
}
