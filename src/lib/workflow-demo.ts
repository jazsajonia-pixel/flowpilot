import type { WorkflowGraph } from './workflow-api';

export const demoWorkflow = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Customer feedback triage',
  description: 'Classify incoming feedback and route a summary.',
  isActive: false,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-04T09:00:00.000Z',
};

export const demoWorkflowGraph: WorkflowGraph = {
  nodes: [
    {
      id: '00000000-0000-4000-8000-000000000011',
      type: 'trigger',
      category: 'manual_trigger',
      label: 'New feedback',
      position: { x: 40, y: 200 },
      config: {},
    },
    {
      id: '00000000-0000-4000-8000-000000000012',
      type: 'ai',
      category: 'ai_classification',
      label: 'Classify sentiment',
      position: { x: 240, y: 200 },
      config: {},
    },
    {
      id: '00000000-0000-4000-8000-000000000013',
      type: 'logic',
      category: 'condition',
      label: 'Is urgent?',
      position: { x: 440, y: 200 },
      config: {},
    },
    {
      id: '00000000-0000-4000-8000-000000000014',
      type: 'action',
      category: 'send_email',
      label: 'Notify support',
      position: { x: 640, y: 200 },
      config: {},
    },
  ],
  connections: [
    {
      id: '00000000-0000-4000-8000-000000000021',
      sourceNodeId: '00000000-0000-4000-8000-000000000011',
      sourceHandle: 'out',
      targetNodeId: '00000000-0000-4000-8000-000000000012',
      targetHandle: 'in',
    },
    {
      id: '00000000-0000-4000-8000-000000000022',
      sourceNodeId: '00000000-0000-4000-8000-000000000012',
      sourceHandle: 'out',
      targetNodeId: '00000000-0000-4000-8000-000000000013',
      targetHandle: 'in',
    },
    {
      id: '00000000-0000-4000-8000-000000000023',
      sourceNodeId: '00000000-0000-4000-8000-000000000013',
      sourceHandle: 'out',
      targetNodeId: '00000000-0000-4000-8000-000000000014',
      targetHandle: 'in',
    },
  ],
};
