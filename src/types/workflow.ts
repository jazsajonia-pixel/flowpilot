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

export interface WorkflowNodeDefinition {
  type: NodeType;
  category: NodeCategory;
  label: string;
  description: string;
}

export const NODE_CATALOG: readonly WorkflowNodeDefinition[] = [
  { type: 'trigger', category: 'manual_trigger', label: 'Manual Trigger', description: 'Start a workflow manually.' },
  { type: 'trigger', category: 'webhook_trigger', label: 'Webhook Trigger', description: 'Start when an external event calls a webhook.' },
  { type: 'trigger', category: 'schedule_trigger', label: 'Schedule Trigger', description: 'Start once a day or on selected UTC weekdays.' },
  { type: 'ai', category: 'gemini_ai', label: 'AI Text Generation', description: 'Generate text or JSON with a selected Gemini or OpenAI model.' },
  { type: 'ai', category: 'ai_classification', label: 'AI Classification', description: 'Classify text into categories.' },
  { type: 'ai', category: 'ai_extraction', label: 'AI Extraction', description: 'Extract structured details from text.' },
  { type: 'ai', category: 'ai_summarization', label: 'AI Summarization', description: 'Summarize text.' },
  { type: 'ai', category: 'ai_generation', label: 'AI Generation', description: 'Generate a creative response.' },
  { type: 'logic', category: 'condition', label: 'Condition', description: 'Branch based on a condition.' },
  { type: 'logic', category: 'switch', label: 'Switch', description: 'Route between multiple cases.' },
  { type: 'logic', category: 'filter', label: 'Filter', description: 'Filter values before continuing.' },
  { type: 'logic', category: 'delay', label: 'Delay', description: 'Pause before the next step.' },
  { type: 'action', category: 'send_email', label: 'Send Email', description: 'Email yourself a notification.' },
  { type: 'action', category: 'http_request', label: 'HTTP Request', description: 'Call an external HTTP endpoint.' },
  { type: 'action', category: 'create_db_record', label: 'Create Database Record', description: 'Create a record in a connected database.' },
  { type: 'action', category: 'update_db_record', label: 'Update Database Record', description: 'Update a record in a connected database.' },
  { type: 'action', category: 'webhook_action', label: 'Webhook Action', description: 'Send an outgoing webhook.' },
];

export const NODE_TYPE_BY_CATEGORY: Record<NodeCategory, NodeType> = {
  manual_trigger: 'trigger',
  webhook_trigger: 'trigger',
  schedule_trigger: 'trigger',
  gemini_ai: 'ai',
  ai_classification: 'ai',
  ai_extraction: 'ai',
  ai_summarization: 'ai',
  ai_generation: 'ai',
  condition: 'logic',
  switch: 'logic',
  filter: 'logic',
  delay: 'logic',
  send_email: 'action',
  http_request: 'action',
  create_db_record: 'action',
  update_db_record: 'action',
  webhook_action: 'action',
};

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
