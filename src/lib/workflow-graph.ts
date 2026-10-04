import type { NodeConnection, NodeType, NodeCategory } from '@/types/workflow';

export interface GraphNodeRef {
  id: string;
  type: NodeType;
  category: NodeCategory;
}

export interface GraphConnectionRef {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface GraphValidationIssue {
  index: number;
  message: string;
}

function createsCycle(
  sourceNodeId: string,
  targetNodeId: string,
  connections: readonly GraphConnectionRef[],
): boolean {
  const outgoing = new Map<string, string[]>();
  for (const connection of connections) {
    const next = outgoing.get(connection.sourceNodeId) ?? [];
    next.push(connection.targetNodeId);
    outgoing.set(connection.sourceNodeId, next);
  }

  const pending = [targetNodeId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    if (current === sourceNodeId) return true;
    visited.add(current);
    pending.push(...(outgoing.get(current) ?? []));
  }
  return false;
}

function connectionProblem(
  sourceNodeId: string,
  targetNodeId: string,
  nodesById: ReadonlyMap<string, GraphNodeRef>,
  existing: readonly GraphConnectionRef[],
): string | null {
  const source = nodesById.get(sourceNodeId);
  const target = nodesById.get(targetNodeId);
  if (!source || !target) return 'Both connected nodes must exist in this workflow.';
  if (sourceNodeId === targetNodeId) return 'A node cannot connect to itself.';
  if (target.type === 'trigger') return 'Trigger nodes cannot receive connections.';
  if (existing.some((edge) => edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId)) {
    return 'This connection already exists.';
  }
  if (createsCycle(sourceNodeId, targetNodeId, existing)) return 'Connections cannot create a cycle.';
  return null;
}

export function isWorkflowConnectionAllowed(
  sourceNodeId: string | null | undefined,
  targetNodeId: string | null | undefined,
  nodes: readonly GraphNodeRef[],
  existing: readonly GraphConnectionRef[],
): boolean {
  if (!sourceNodeId || !targetNodeId) return false;
  return connectionProblem(sourceNodeId, targetNodeId, new Map(nodes.map((node) => [node.id, node])), existing) === null;
}

export function validateWorkflowConnections(
  nodes: readonly GraphNodeRef[],
  connections: readonly GraphConnectionRef[],
): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const accepted: GraphConnectionRef[] = [];
  const ids = new Set<string>();

  connections.forEach((connection, index) => {
    if (ids.has(connection.id)) {
      issues.push({ index, message: 'Connection IDs must be unique.' });
      return;
    }
    ids.add(connection.id);
    const problem = connectionProblem(connection.sourceNodeId, connection.targetNodeId, nodesById, accepted);
    if (problem) {
      issues.push({ index, message: problem });
      return;
    }
    accepted.push(connection);
  });

  return issues;
}

export function toGraphConnection(connection: NodeConnection): GraphConnectionRef {
  return {
    id: connection.id,
    sourceNodeId: connection.sourceNodeId,
    targetNodeId: connection.targetNodeId,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle,
  };
}
