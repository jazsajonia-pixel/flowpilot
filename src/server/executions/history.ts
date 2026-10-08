import { z } from 'zod';
import { NODE_CATALOG, type NodeCategory } from '../../types/workflow';

export const EXECUTION_PAGE_SIZE = 25;
/** A run still pending/running after this long cannot be alive (function max duration is 60 s). */
export const INTERRUPTED_AFTER_MS = 5 * 60 * 1000;

export const EXECUTION_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;
export type ExecutionStatusValue = (typeof EXECUTION_STATUSES)[number];
export type ExecutionTrigger = 'manual' | 'webhook' | 'schedule' | 'unknown';

export interface ExecutionCursor { createdAt: Date; id: string }

export function encodeExecutionCursor(cursor: ExecutionCursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`, 'utf8').toString('base64url');
}

export function decodeExecutionCursor(value: string): ExecutionCursor | null {
  if (value.length > 200) return null;
  const decoded = Buffer.from(value, 'base64url').toString('utf8');
  const [iso, id, extra] = decoded.split('|');
  if (extra !== undefined || !iso || !id || !z.string().uuid().safeParse(id).success) return null;
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== iso) return null;
  return { createdAt, id };
}

const listQuerySchema = z.object({
  status: z.enum(EXECUTION_STATUSES).optional(),
  workflowId: z.string().uuid().optional(),
  cursor: z.string().max(200).optional(),
}).strict();

export type ExecutionListQuery = { status?: ExecutionStatusValue; workflowId?: string; cursor?: ExecutionCursor };

/** Parse ?status=&workflowId=&cursor= ; returns null for any invalid or unknown parameter. */
export function parseExecutionListQuery(params: URLSearchParams): ExecutionListQuery | null {
  const raw: Record<string, string> = {};
  for (const [key, value] of params) {
    if (key in raw) return null;
    if (value !== '') raw[key] = value;
  }
  const parsed = listQuerySchema.safeParse(raw);
  if (!parsed.success) return null;
  const cursor = parsed.data.cursor ? decodeExecutionCursor(parsed.data.cursor) : undefined;
  if (cursor === null) return null;
  return {
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.workflowId ? { workflowId: parsed.data.workflowId } : {}),
    ...(cursor ? { cursor } : {}),
  };
}

export function triggerFromCategory(category: unknown, scheduledAt: Date | string | null): ExecutionTrigger {
  if (scheduledAt) return 'schedule';
  if (category === 'manual_trigger') return 'manual';
  if (category === 'webhook_trigger') return 'webhook';
  if (category === 'schedule_trigger') return 'schedule';
  return 'unknown';
}

export function isInterrupted(status: string, createdAt: Date, now = new Date()): boolean {
  return (status === 'pending' || status === 'running') && now.getTime() - createdAt.getTime() > INTERRUPTED_AFTER_MS;
}

export function durationMs(startedAt: Date | null, completedAt: Date | null): number | null {
  if (!startedAt || !completedAt) return null;
  return Math.max(0, completedAt.getTime() - startedAt.getTime());
}

const labelByCategory = new Map<string, string>(NODE_CATALOG.map((entry) => [entry.category, entry.label]));

export function categoryOfLog(inputData: unknown): NodeCategory | null {
  if (typeof inputData !== 'object' || inputData === null || !('category' in inputData)) return null;
  const category = (inputData as { category: unknown }).category;
  return typeof category === 'string' && labelByCategory.has(category) ? category as NodeCategory : null;
}

/** Prefer the node's current label; fall back to the catalog label when the node was since deleted. */
export function stepLabel(nodeId: string, category: NodeCategory | null, currentLabels: Map<string, string>): string {
  return currentLabels.get(nodeId) ?? (category ? labelByCategory.get(category) ?? 'Workflow step' : 'Workflow step');
}
