export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ExecutionTrigger = 'manual' | 'webhook' | 'schedule' | 'unknown';

export interface ExecutionHistoryItem {
  id: string;
  workflowId: string;
  workflowTitle: string;
  status: ExecutionStatus;
  interrupted: boolean;
  trigger: ExecutionTrigger;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  scheduledAt: string | null;
  durationMs: number | null;
  retryOf: string | null;
  steps: { succeeded: number; failed: number; skipped: number };
}

export interface ExecutionStepLog {
  nodeId: string;
  label: string;
  category: string | null;
  nodeExists: boolean;
  status: 'success' | 'error' | 'skipped';
  timestamp: string;
  outputData: unknown;
  error: string | null;
}

export interface ExecutionDetail extends ExecutionHistoryItem {
  triggerData: unknown;
  retriedBy: string | null;
  retry: { allowed: boolean; reason: string | null };
  logs: ExecutionStepLog[];
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init });
  } catch {
    throw new Error('Execution history is unavailable.');
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `Execution request failed (${response.status}).`;
    throw new Error(message);
  }
  if (payload === null) throw new Error('Execution history returned an invalid response.');
  return payload as T;
}

export async function listExecutionHistory(filters: { status?: ExecutionStatus; workflowId?: string; cursor?: string }) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.workflowId) params.set('workflowId', filters.workflowId);
  if (filters.cursor) params.set('cursor', filters.cursor);
  const query = params.toString();
  return request<{ executions: ExecutionHistoryItem[]; nextCursor: string | null }>(`/api/executions${query ? `?${query}` : ''}`);
}

export async function getExecutionDetail(executionId: string): Promise<ExecutionDetail> {
  return (await request<{ execution: ExecutionDetail }>(`/api/executions/${encodeURIComponent(executionId)}`)).execution;
}

export async function retryExecutionRun(executionId: string): Promise<{ id: string; status: ExecutionStatus; error: string | null }> {
  return (await request<{ execution: { id: string; status: ExecutionStatus; error: string | null } }>(
    `/api/executions/${encodeURIComponent(executionId)}/retry`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  )).execution;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

export const TRIGGER_LABELS: Record<ExecutionTrigger, string> = { manual: 'Manual', webhook: 'Webhook', schedule: 'Schedule', unknown: 'Unknown' };

export function statusLabel(item: Pick<ExecutionHistoryItem, 'status' | 'interrupted'>): string {
  if (item.interrupted) return 'Interrupted';
  return { pending: 'Pending', running: 'Running', completed: 'Completed', failed: 'Failed' }[item.status];
}
