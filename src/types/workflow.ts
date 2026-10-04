/**
 * Core Workflow Engine Architecture Types
 */

export type NodeType = 'trigger' | 'ai' | 'logic' | 'action';

export type NodeCategory =
  | 'manual_trigger'
  | 'webhook_trigger'
  | 'schedule_trigger'
  | 'gemini_ai'
  | 'ai_classification'
  | 'ai_extraction'
  | 'ai_summarization'
  | 'ai_generation'
  | 'condition'
  | 'switch'
  | 'filter'
  | 'delay'
  | 'send_email'
  | 'http_request'
  | 'create_db_record'
  | 'update_db_record'
  | 'webhook_action';

export interface WorkflowNode {
  id: string;
  type: NodeType;
  category: NodeCategory;
  label: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface NodeConnection {
  id: string;
  sourceNodeId: string;
  sourceHandle?: string;
  targetNodeId: string;
  targetHandle?: string;
}

export interface Workflow {
  id: string;
  title: string;
  description?: string;
  nodes: WorkflowNode[];
  connections: NodeConnection[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ExecutionLog {
  nodeId: string;
  status: 'success' | 'error' | 'skipped';
  timestamp: string;
  inputData?: unknown;
  outputData?: unknown;
  error?: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;
  logs: ExecutionLog[];
}
