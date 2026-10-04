import type { Edge } from '@xyflow/react';
import type { NodeConnection, WorkflowNode } from '@/types/workflow';
import type { FlowEdge, FlowNode } from './flow-types';

export function toFlowNode(node: WorkflowNode): FlowNode {
  return {
    id: node.id,
    type: 'workflowNode',
    position: node.position,
    data: {
      nodeType: node.type,
      category: node.category,
      label: node.label,
      config: node.config,
    },
  };
}

export function toWorkflowNode(node: FlowNode): WorkflowNode {
  return {
    id: node.id,
    type: node.data.nodeType,
    category: node.data.category,
    label: node.data.label,
    position: node.position,
    config: node.data.config,
  };
}

export function toFlowEdge(connection: NodeConnection): FlowEdge {
  return {
    id: connection.id,
    source: connection.sourceNodeId,
    sourceHandle: connection.sourceHandle ?? null,
    target: connection.targetNodeId,
    targetHandle: connection.targetHandle ?? null,
    type: 'smoothstep',
  };
}

export function toWorkflowConnection(edge: Edge): NodeConnection {
  return {
    id: edge.id,
    sourceNodeId: edge.source,
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    targetNodeId: edge.target,
    ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
  };
}
