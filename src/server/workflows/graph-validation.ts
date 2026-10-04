import { z } from 'zod';
import { validateWorkflowConnections } from '../../lib/workflow-graph';
import { NODE_CATALOG, NODE_TYPE_BY_CATEGORY } from '../../types/workflow';
import { workflowIdSchema } from './validation';

const nodeTypes = ['trigger', 'ai', 'logic', 'action'] as const;
const nodeCategories = NODE_CATALOG.map((definition) => definition.category) as [
  (typeof NODE_CATALOG)[number]['category'],
  ...(typeof NODE_CATALOG)[number]['category'][],
];

const positionSchema = z
  .object({
    x: z.number().finite().min(-100_000).max(100_000),
    y: z.number().finite().min(-100_000).max(100_000),
  })
  .strict();

const emptyConfigSchema = z
  .record(z.unknown())
  .refine((value) => Object.keys(value).length === 0, 'Node configuration is not editable in this phase.');

const workflowNodeSchema = z
  .object({
    id: workflowIdSchema,
    type: z.enum(nodeTypes),
    category: z.enum(nodeCategories),
    label: z.string().trim().min(1).max(200),
    position: positionSchema,
    config: emptyConfigSchema,
  })
  .strict()
  .superRefine((node, context) => {
    if (NODE_TYPE_BY_CATEGORY[node.category] !== node.type) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Node type does not match its category.', path: ['type'] });
    }
  });

const workflowConnectionSchema = z
  .object({
    id: workflowIdSchema,
    sourceNodeId: workflowIdSchema,
    sourceHandle: z.string().max(128).nullable().optional(),
    targetNodeId: workflowIdSchema,
    targetHandle: z.string().max(128).nullable().optional(),
  })
  .strict();

export const workflowGraphSchema = z
  .object({
    nodes: z.array(workflowNodeSchema).max(200),
    connections: z.array(workflowConnectionSchema).max(500),
  })
  .strict()
  .superRefine((graph, context) => {
    const nodeIds = new Set<string>();
    graph.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Node IDs must be unique.', path: ['nodes', index, 'id'] });
      }
      nodeIds.add(node.id);
    });

    if (graph.nodes.filter((node) => node.type === 'trigger').length > 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'A workflow can contain at most one trigger node.', path: ['nodes'] });
    }

    for (const issue of validateWorkflowConnections(graph.nodes, graph.connections)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: ['connections', issue.index],
      });
    }
  });

export type WorkflowGraphInput = z.infer<typeof workflowGraphSchema>;
