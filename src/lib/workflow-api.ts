import type { NodeConnection, WorkflowNode } from '@/types/workflow';

export interface WorkflowSummary {
  id: string;
  title: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  connections: NodeConnection[];
}

export interface WorkflowExecutionLogSummary {
  nodeId: string;
  status: 'success' | 'error' | 'skipped';
  timestamp: string;
  inputData?: unknown;
  outputData?: unknown;
  error?: string;
}

export interface WorkflowExecutionSummary {
  id: string;
  workflowId: string;
  status: 'completed' | 'failed';
  startedAt: string;
  completedAt: string;
  error: string | null;
  logs: WorkflowExecutionLogSummary[];
}

export class WorkflowApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'WorkflowApiError';
  }
}

async function readJson<T>(response: Response): Promise<T> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Static previews and unconfigured local functions may return non-JSON responses.
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `Workflow request failed (${response.status}).`;
    throw new WorkflowApiError(message, response.status);
  }
  if (payload === null) throw new WorkflowApiError('The workflow service returned an invalid response.');
  return payload as T;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
  });
  return readJson<T>(response);
}

export async function listWorkflows(): Promise<WorkflowSummary[]> {
  const result = await request<{ workflows: WorkflowSummary[] }>('/api/workflows');
  return result.workflows;
}

export async function createWorkflow(title: string): Promise<WorkflowSummary> {
  const result = await request<{ workflow: WorkflowSummary }>('/api/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return result.workflow;
}

export async function getWorkflow(workflowId: string): Promise<WorkflowSummary> {
  const result = await request<{ workflow: WorkflowSummary }>(`/api/workflows/${encodeURIComponent(workflowId)}`);
  return result.workflow;
}

export async function updateWorkflowTitle(workflowId: string, title: string): Promise<WorkflowSummary> {
  const result = await request<{ workflow: WorkflowSummary }>(`/api/workflows/${encodeURIComponent(workflowId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return result.workflow;
}

export async function getWorkflowGraph(workflowId: string): Promise<WorkflowGraph> {
  const result = await request<{ graph: WorkflowGraph }>(`/api/workflows/${encodeURIComponent(workflowId)}/graph`);
  return result.graph;
}

export async function saveWorkflowGraph(workflowId: string, graph: WorkflowGraph): Promise<void> {
  await request<{ ok: true }>(`/api/workflows/${encodeURIComponent(workflowId)}/graph`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(graph),
  });
}

export async function runWorkflow(workflowId: string, input: Record<string, unknown>): Promise<WorkflowExecutionSummary> {
  const result = await request<{ execution: WorkflowExecutionSummary }>(
    `/api/workflows/${encodeURIComponent(workflowId)}/executions`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input }) },
  );
  return result.execution;
}
