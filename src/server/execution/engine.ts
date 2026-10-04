import { isDeepStrictEqual } from 'node:util';
import type { NodeConnection, WorkflowNode } from '../../types/workflow';
import type { WorkflowGraphInput } from '../workflows/graph-validation';
import { safeExecutionError, summarizeNodeInput, summarizeNodeOutput, type SafeExecutionLog } from './logging';
import { OutboundRequestError, sendPublicHttpsRequest, type OutboundHttpResult } from './outbound-http';
import { resolveTemplate, type ExecutionContext } from './templates';

const MAX_GRAPH_NODES = 50;
const MAX_EXECUTED_NODES = 25;
const DEFAULT_EXECUTION_BUDGET_MS = 5_000;

const comparisonOperators = new Set([
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'greater_than',
  'less_than',
  'is_empty',
  'is_not_empty',
]);

export interface WorkflowExecutionResult {
  status: 'completed' | 'failed';
  logs: SafeExecutionLog[];
  error?: string;
}

export interface WorkflowExecutionOptions {
  timeoutMs?: number;
  request?: typeof sendPublicHttpsRequest;
  now?: () => number;
}

class WorkflowNodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowNodeError';
  }
}

type RuntimeConnection = Omit<NodeConnection, 'sourceHandle' | 'targetHandle'> & {
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

function getTopologicalOrder(nodes: WorkflowNode[], connections: RuntimeConnection[]): WorkflowNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));

  for (const connection of connections) {
    if (!nodeById.has(connection.sourceNodeId) || !nodeById.has(connection.targetNodeId)) {
      throw new WorkflowNodeError('Workflow graph is invalid.');
    }
    indegree.set(connection.targetNodeId, (indegree.get(connection.targetNodeId) ?? 0) + 1);
    outgoing.get(connection.sourceNodeId)?.push(connection.targetNodeId);
  }

  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const result: WorkflowNode[] = [];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor];
    const node = nodeById.get(id);
    if (!node) continue;
    result.push(node);
    for (const targetId of outgoing.get(id) ?? []) {
      const nextIndegree = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, nextIndegree);
      if (nextIndegree === 0) queue.push(targetId);
    }
  }
  if (result.length !== nodes.length) throw new WorkflowNodeError('Workflow graph contains a cycle.');
  return result;
}

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0)
  );
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function evaluateOperator(operator: string, left: unknown, right: unknown): boolean {
  if (!comparisonOperators.has(operator)) throw new WorkflowNodeError('Condition operator is not supported.');
  if (operator === 'is_empty') return isEmpty(left);
  if (operator === 'is_not_empty') return !isEmpty(left);
  if (operator === 'equals') return isDeepStrictEqual(left, right);
  if (operator === 'not_equals') return !isDeepStrictEqual(left, right);
  if (operator === 'contains' || operator === 'not_contains') {
    const contains = typeof left === 'string'
      ? left.includes(String(right ?? ''))
      : Array.isArray(left) && left.some((entry) => isDeepStrictEqual(entry, right));
    return operator === 'contains' ? contains : !contains;
  }
  const leftNumber = numericValue(left);
  const rightNumber = numericValue(right);
  if (leftNumber === null || rightNumber === null) throw new WorkflowNodeError('Numeric comparison requires two numbers.');
  return operator === 'greater_than' ? leftNumber > rightNumber : leftNumber < rightNumber;
}

function requireString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  if (typeof value !== 'string' || value.trim() === '') throw new WorkflowNodeError('Node configuration is incomplete.');
  return value;
}

function requireOperator(config: Record<string, unknown>): string {
  const value = config.operator;
  if (typeof value !== 'string' || !comparisonOperators.has(value)) {
    throw new WorkflowNodeError('Node configuration is incomplete.');
  }
  return value;
}

function resolveJsonBody(bodyTemplate: unknown, context: ExecutionContext): string | undefined {
  if (bodyTemplate === undefined || bodyTemplate === '') return undefined;
  if (typeof bodyTemplate !== 'string') throw new WorkflowNodeError('Node configuration is invalid.');
  let body: unknown;
  try {
    body = JSON.parse(bodyTemplate);
  } catch {
    throw new WorkflowNodeError('Request body must be valid JSON.');
  }
  const resolved = resolveTemplate(body, context);
  const serialized = JSON.stringify(resolved);
  if (serialized === undefined) throw new WorkflowNodeError('Request body could not be prepared.');
  return serialized;
}

function applyCondition(node: WorkflowNode, context: ExecutionContext): { result: boolean } {
  const operator = requireOperator(node.config);
  const leftTemplate = requireString(node.config, 'left');
  const left = resolveTemplate(leftTemplate, context);
  let right: unknown;
  if (operator !== 'is_empty' && operator !== 'is_not_empty') {
    const rightTemplate = requireString(node.config, 'right');
    right = resolveTemplate(rightTemplate, context);
  }
  return { result: evaluateOperator(operator, left, right) };
}

function applyFilter(node: WorkflowNode, context: ExecutionContext): { items: unknown[]; count: number } {
  const arrayPath = requireString(node.config, 'arrayPath');
  const fieldPath = requireString(node.config, 'fieldPath');
  const operator = requireOperator(node.config);
  const source = resolveTemplate(`{{${arrayPath}}}`, context);
  if (!Array.isArray(source)) throw new WorkflowNodeError('Filter input must resolve to an array.');

  let expected: unknown;
  if (operator !== 'is_empty' && operator !== 'is_not_empty') {
    const valueTemplate = requireString(node.config, 'value');
    expected = resolveTemplate(valueTemplate, context);
  }
  const items = source.filter((item) => {
    const left = resolveTemplate(`{{item.${fieldPath}}}`, { ...context, item });
    return evaluateOperator(operator, left, expected);
  });
  return { items, count: items.length };
}

async function runNode(
  node: WorkflowNode,
  context: ExecutionContext,
  request: typeof sendPublicHttpsRequest,
  remainingMs: number,
): Promise<unknown> {
  if (node.category === 'manual_trigger') return { received: true };
  if (node.category === 'condition') return applyCondition(node, context);
  if (node.category === 'filter') return applyFilter(node, context);

  if (node.category === 'http_request' || node.category === 'webhook_action') {
    const urlTemplate = requireString(node.config, 'url');
    const resolvedUrl = resolveTemplate(urlTemplate, context);
    if (typeof resolvedUrl !== 'string') throw new WorkflowNodeError('The destination URL is invalid.');
    const method = node.category === 'webhook_action' ? 'POST' : node.config.method ?? 'GET';
    if (method !== 'GET' && method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') {
      throw new WorkflowNodeError('Node configuration is incomplete.');
    }
    const body = resolveJsonBody(node.config.body, context);
    if ((method === 'GET' || method === 'DELETE') && body !== undefined) {
      throw new WorkflowNodeError('GET and DELETE actions cannot include a request body.');
    }
    const response: OutboundHttpResult = await request(resolvedUrl, method, body, Math.min(2_500, remainingMs));
    return { status: response.status, ok: true, body: response.body, responseBytes: response.responseBytes };
  }

  throw new WorkflowNodeError('This node is not executable in Phase 4.');
}

export async function executeWorkflowGraph(
  graph: WorkflowGraphInput,
  triggerInput: Record<string, unknown>,
  options: WorkflowExecutionOptions = {},
): Promise<WorkflowExecutionResult> {
  const now = options.now ?? Date.now;
  const request = options.request ?? sendPublicHttpsRequest;
  const startTime = now();
  const deadline = startTime + Math.min(options.timeoutMs ?? DEFAULT_EXECUTION_BUDGET_MS, DEFAULT_EXECUTION_BUDGET_MS);
  const logs: SafeExecutionLog[] = [];
  const triggerNodes = graph.nodes.filter((node) => node.category.endsWith('_trigger'));

  if (graph.nodes.length === 0 || graph.nodes.length > MAX_GRAPH_NODES) {
    return { status: 'failed', logs, error: 'Workflow must contain between 1 and 50 nodes.' };
  }
  if (triggerNodes.length !== 1 || triggerNodes[0].category !== 'manual_trigger') {
    return { status: 'failed', logs, error: 'A single Manual Trigger is required to run this workflow in Phase 4.' };
  }

  let orderedNodes: WorkflowNode[];
  try {
    orderedNodes = getTopologicalOrder(graph.nodes, graph.connections);
  } catch {
    return { status: 'failed', logs, error: 'Workflow graph is invalid.' };
  }

  const context: ExecutionContext = { trigger: triggerInput, steps: {} };
  const activeConnections = new Set<string>();
  const incomingByTarget = new Map<string, RuntimeConnection[]>();
  const outgoingBySource = new Map<string, RuntimeConnection[]>();
  for (const connection of graph.connections) {
    incomingByTarget.set(connection.targetNodeId, [...(incomingByTarget.get(connection.targetNodeId) ?? []), connection]);
    outgoingBySource.set(connection.sourceNodeId, [...(outgoingBySource.get(connection.sourceNodeId) ?? []), connection]);
  }

  let executedCount = 0;
  let failure: string | undefined;
  for (const node of orderedNodes) {
    const incoming = incomingByTarget.get(node.id) ?? [];
    const isTrigger = node.id === triggerNodes[0].id;
    const isReachable = isTrigger || incoming.some((connection) => activeConnections.has(connection.id));

    if (!isReachable) {
      logs.push({ nodeId: node.id, status: 'skipped', timestamp: new Date(now()).toISOString(), inputData: summarizeNodeInput(node.category) });
      continue;
    }
    if (now() >= deadline || executedCount >= MAX_EXECUTED_NODES) {
      failure = 'Execution time or step limit reached.';
      logs.push({ nodeId: node.id, status: 'error', timestamp: new Date(now()).toISOString(), inputData: summarizeNodeInput(node.category), error: failure });
      break;
    }

    executedCount += 1;
    try {
      const remainingMs = deadline - now();
      const output = await runNode(node, context, request, remainingMs);
      context.steps[node.id] = output;
      logs.push({
        nodeId: node.id,
        status: 'success',
        timestamp: new Date(now()).toISOString(),
        inputData: summarizeNodeInput(node.category),
        outputData: summarizeNodeOutput(node.category, output),
      });
      const outgoing = outgoingBySource.get(node.id) ?? [];
      const conditionResult = node.category === 'condition' && typeof output === 'object' && output !== null
        ? (output as { result?: unknown }).result
        : undefined;
      for (const connection of outgoing) {
        if (node.category === 'condition' && connection.sourceHandle === 'true' && conditionResult !== true) continue;
        if (node.category === 'condition' && connection.sourceHandle === 'false' && conditionResult !== false) continue;
        activeConnections.add(connection.id);
      }
    } catch (error) {
      failure = safeExecutionError(error);
      if (error instanceof OutboundRequestError && error.message.startsWith('The external service returned HTTP ')) {
        failure = error.message;
      }
      logs.push({
        nodeId: node.id,
        status: 'error',
        timestamp: new Date(now()).toISOString(),
        inputData: summarizeNodeInput(node.category),
        error: failure,
      });
      break;
    }
  }

  if (failure) {
    const logged = new Set(logs.map((log) => log.nodeId));
    for (const node of orderedNodes) {
      if (!logged.has(node.id)) {
        logs.push({ nodeId: node.id, status: 'skipped', timestamp: new Date(now()).toISOString(), inputData: summarizeNodeInput(node.category) });
      }
    }
    return { status: 'failed', logs, error: failure };
  }

  return { status: 'completed', logs };
}
