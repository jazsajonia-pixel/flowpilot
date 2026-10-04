import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isWorkflowConnectionAllowed } from '../src/lib/workflow-graph';
import { workflowGraphSchema } from '../src/server/workflows/graph-validation';
import type { WorkflowGraph } from '../src/lib/workflow-api';

const triggerId = '9d4a9c3d-3e7e-4a2b-8f2a-6c68edb55c51';
const aiId = '9d4a9c3d-3e7e-4a2b-8f2a-6c68edb55c52';
const actionId = '9d4a9c3d-3e7e-4a2b-8f2a-6c68edb55c53';
const secondTriggerId = '9d4a9c3d-3e7e-4a2b-8f2a-6c68edb55c54';
const connectionId1 = '9d4a9c3d-3e7e-4a2b-8f2a-6c68edb55c61';
const connectionId2 = '9d4a9c3d-3e7e-4a2b-8f2a-6c68edb55c62';
const connectionId3 = '9d4a9c3d-3e7e-4a2b-8f2a-6c68edb55c63';

const nodes: WorkflowGraph['nodes'] = [
  { id: triggerId, type: 'trigger', category: 'manual_trigger', label: 'Manual Trigger', position: { x: 20, y: 30 }, config: {} },
  { id: aiId, type: 'ai', category: 'gemini_ai', label: 'Gemini AI', position: { x: 260, y: 30 }, config: {} },
  { id: actionId, type: 'action', category: 'send_email', label: 'Send Email', position: { x: 500, y: 30 }, config: {} },
];

test('workflow graph accepts a valid acyclic trigger-to-action path', () => {
  const graph: WorkflowGraph = {
    nodes,
    connections: [
      { id: connectionId1, sourceNodeId: triggerId, sourceHandle: 'out', targetNodeId: aiId, targetHandle: 'in' },
      { id: connectionId2, sourceNodeId: aiId, sourceHandle: 'out', targetNodeId: actionId, targetHandle: 'in' },
    ],
  };
  assert.equal(workflowGraphSchema.safeParse(graph).success, true);
});

test('connection validation rejects self-links, missing endpoints, duplicate links, trigger targets, and cycles', () => {
  assert.equal(isWorkflowConnectionAllowed(triggerId, aiId, nodes, []), true);
  assert.equal(isWorkflowConnectionAllowed(triggerId, triggerId, nodes, []), false);
  assert.equal(isWorkflowConnectionAllowed('missing', aiId, nodes, []), false);
  assert.equal(isWorkflowConnectionAllowed(aiId, triggerId, nodes, []), false);
  assert.equal(
    isWorkflowConnectionAllowed(actionId, aiId, nodes, [
      { id: connectionId1, sourceNodeId: aiId, targetNodeId: actionId },
    ]),
    false,
  );
  assert.equal(
    isWorkflowConnectionAllowed(triggerId, aiId, nodes, [
      { id: connectionId1, sourceNodeId: triggerId, targetNodeId: aiId },
    ]),
    false,
  );
});

test('server graph schema rejects cycles, multiple triggers, and unapproved node config', () => {
  const cycle = workflowGraphSchema.safeParse({
    nodes,
    connections: [
      { id: connectionId1, sourceNodeId: triggerId, targetNodeId: aiId },
      { id: connectionId2, sourceNodeId: aiId, targetNodeId: actionId },
      { id: connectionId3, sourceNodeId: actionId, targetNodeId: aiId },
    ],
  });
  const multipleTriggers = workflowGraphSchema.safeParse({
    nodes: [...nodes, { id: secondTriggerId, type: 'trigger', category: 'webhook_trigger', label: 'Webhook', position: { x: 0, y: 0 }, config: {} }],
    connections: [],
  });
  const config = workflowGraphSchema.safeParse({
    nodes: [{ ...nodes[1], config: { apiKey: 'never-store-here' } }],
    connections: [],
  });

  assert.equal(cycle.success, false);
  assert.equal(multipleTriggers.success, false);
  assert.equal(config.success, false);
});

test('server graph schema rejects cross-workflow and duplicate connections', () => {
  const duplicate = workflowGraphSchema.safeParse({
    nodes,
    connections: [
      { id: connectionId1, sourceNodeId: triggerId, targetNodeId: aiId },
      { id: connectionId1, sourceNodeId: aiId, targetNodeId: actionId },
    ],
  });
  const missingNode = workflowGraphSchema.safeParse({
    nodes,
    connections: [{ id: connectionId3, sourceNodeId: triggerId, targetNodeId: secondTriggerId }],
  });

  assert.equal(duplicate.success, false);
  assert.equal(missingNode.success, false);
});
