import { jsonResponse, parseJsonBody } from '../auth/http';
import { executeWorkflowGraph, type WorkflowExecutionResult } from '../execution/engine';
import { summarizeTriggerInput, type SafeExecutionLog } from '../execution/logging';
import { workflowGraphSchema, type WorkflowGraphInput } from './graph-validation';
import { webhookBodySchema } from './webhook-validation';

const MAX_WEBHOOK_BODY_BYTES = 16 * 1024;
const notFoundResponse = () => jsonResponse(404, { error: 'Workflow not found.' });

type WebhookWorkflow = { id: string; ownerId: string };
type CreatedExecution = { id: string };
type LoadedGraph = { nodes: unknown[]; connections: unknown[] };

export interface WebhookExecutionStore {
  findActiveWorkflow: (token: string) => Promise<WebhookWorkflow | null>;
  loadGraph: (workflowId: string) => Promise<LoadedGraph>;
  createExecution: (workflowId: string, triggerData: Record<string, unknown>) => Promise<CreatedExecution | null>;
  markRunning: (workflowId: string, executionId: string, startedAt: Date) => Promise<void>;
  appendLogs: (executionId: string, logs: SafeExecutionLog[]) => Promise<void>;
  finishExecution: (workflowId: string, executionId: string, result: WorkflowExecutionResult, completedAt: Date) => Promise<void>;
  failExecution: (workflowId: string, executionId: string) => Promise<void>;
}

export interface WebhookExecutionDependencies {
  store: WebhookExecutionStore;
  runGraph?: (graph: WorkflowGraphInput, input: Record<string, unknown>, ownerId: string) => Promise<WorkflowExecutionResult>;
}

async function defaultRunGraph(graph: WorkflowGraphInput, input: Record<string, unknown>): Promise<WorkflowExecutionResult> {
  return executeWorkflowGraph(graph, input, { triggerCategory: 'webhook_trigger' });
}

export async function handleWebhookRequest(
  request: Request,
  token: string | undefined,
  dependencies: WebhookExecutionDependencies,
): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
  if (!token || token.length > 64) return notFoundResponse();

  let workflow: WebhookWorkflow | null = null;
  let execution: CreatedExecution | null = null;
  try {
    workflow = await dependencies.store.findActiveWorkflow(token);
    if (!workflow) return notFoundResponse();

    const body = await parseJsonBody(request, MAX_WEBHOOK_BODY_BYTES);
    if (!body.ok) return jsonResponse(body.status, { error: body.message });
    const parsedBody = webhookBodySchema.safeParse(body.value);
    if (!parsedBody.success) return jsonResponse(400, { error: 'Webhook body must be a JSON object.' });
    const triggerInput = parsedBody.data;

    const loadedGraph = await dependencies.store.loadGraph(workflow.id);
    const parsedGraph = workflowGraphSchema.safeParse(loadedGraph);
    if (!parsedGraph.success) return jsonResponse(422, { error: 'Workflow graph is invalid. Review its node settings and connections.' });
    const triggerNodes = parsedGraph.data.nodes.filter((node) => node.type === 'trigger');
    if (triggerNodes.length !== 1 || triggerNodes[0].category !== 'webhook_trigger') return notFoundResponse();
    if (parsedGraph.data.nodes.length > 50) return jsonResponse(422, { error: 'A webhook run is limited to 50 workflow nodes.' });

    execution = await dependencies.store.createExecution(workflow.id, summarizeTriggerInput(triggerInput));
    if (!execution) return jsonResponse(503, { error: 'Workflow execution could not be started.' });

    const startedAt = new Date();
    await dependencies.store.markRunning(workflow.id, execution.id, startedAt);
    const runGraph = dependencies.runGraph ?? ((graph, input) => defaultRunGraph(graph, input));
    const result = await runGraph(parsedGraph.data, triggerInput, workflow.ownerId);
    if (result.logs.length > 0) await dependencies.store.appendLogs(execution.id, result.logs);

    const completedAt = new Date();
    await dependencies.store.finishExecution(workflow.id, execution.id, result, completedAt);
    return jsonResponse(200, {
      execution: {
        id: execution.id,
        workflowId: workflow.id,
        status: result.status,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        error: result.error ?? null,
        logs: result.logs,
      },
    });
  } catch {
    if (workflow && execution) {
      try { await dependencies.store.failExecution(workflow.id, execution.id); } catch { /* avoid exposing persistence details */ }
    }
    return jsonResponse(503, { error: 'Workflow execution service unavailable.' });
  }
}
