import type { Edge, Node } from '@xyflow/react';
import type { NodeCategory, NodeType } from '@/types/workflow';

export interface FlowNodeData extends Record<string, unknown> {
  nodeType: NodeType;
  category: NodeCategory;
  label: string;
  config: Record<string, unknown>;
  /** Ephemeral display state. Graph mapping intentionally excludes it from persistence. */
  executionStatus?: 'running' | 'success' | 'error' | 'skipped';
}

export type FlowNode = Node<FlowNodeData, 'workflowNode'>;
export type FlowEdge = Edge;
