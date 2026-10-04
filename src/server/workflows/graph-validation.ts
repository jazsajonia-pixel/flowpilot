import { z } from 'zod';
import { validateWorkflowConnections } from '../../lib/workflow-graph';
import { NODE_CATALOG, NODE_TYPE_BY_CATEGORY, type NodeCategory } from '../../types/workflow';
import { isAIModelForProvider } from '../../types/ai';
import { isOpenAIStrictJsonSchema, parseResponseJsonSchema } from '../ai/json-schema';
import { workflowIdSchema } from './validation';

const nodeTypes = ['trigger', 'ai', 'logic', 'action'] as const;
const nodeCategories = NODE_CATALOG.map((definition) => definition.category) as [
  (typeof NODE_CATALOG)[number]['category'],
  ...(typeof NODE_CATALOG)[number]['category'][],
];
const operators = ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'] as const;

const positionSchema = z
  .object({
    x: z.number().finite().min(-100_000).max(100_000),
    y: z.number().finite().min(-100_000).max(100_000),
  })
  .strict();

const emptyConfigSchema = z
  .record(z.unknown())
  .refine((value) => Object.keys(value).length === 0, 'This node has no editable configuration in this phase.');

const conditionConfigSchema = z
  .object({
    left: z.string().max(512).optional(),
    operator: z.enum(operators).optional(),
    right: z.string().max(512).optional(),
  })
  .strict();

const filterConfigSchema = z
  .object({
    arrayPath: z.string().max(512).optional(),
    fieldPath: z.string().max(512).optional(),
    operator: z.enum(operators).optional(),
    value: z.string().max(512).optional(),
  })
  .strict();

const httpRequestConfigSchema = z
  .object({
    url: z.string().max(2_048).optional(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
    body: z.string().max(32_768).optional(),
  })
  .strict()
  .superRefine((config, context) => {
    const method = config.method ?? 'GET';
    if ((method === 'GET' || method === 'DELETE') && config.body?.trim()) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'GET and DELETE requests cannot include a body.', path: ['body'] });
    }
  });

const webhookActionConfigSchema = z
  .object({
    url: z.string().max(2_048).optional(),
    body: z.string().max(32_768).optional(),
  })
  .strict();

const aiCommonConfigSchema = z.object({
  prompt: z.string().max(16_384).optional(),
  systemInstruction: z.string().max(4_096).optional(),
  temperature: z.number().finite().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(2_048).optional(),
});

const aiProviderConfigFields = {
  provider: z.enum(['gemini', 'openai']).optional(),
  credentialId: workflowIdSchema.optional(),
  model: z.string().max(80).optional(),
};

function validateAIProviderSelection(config: { provider?: 'gemini' | 'openai'; model?: string }, context: z.RefinementCtx): void {
  const provider = config.provider ?? 'gemini';
  if (config.model !== undefined && !isAIModelForProvider(provider, config.model)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose a supported model for the selected AI provider.', path: ['model'] });
  }
}

const geminiAIConfigSchema = aiCommonConfigSchema.extend({
  ...aiProviderConfigFields,
  outputFormat: z.enum(['text', 'json']).optional(),
  responseSchema: z.string().max(8_192).optional(),
}).strict().superRefine((config, context) => {
  validateAIProviderSelection(config, context);
  if (config.responseSchema?.trim() && config.outputFormat !== 'json') {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'A response schema requires JSON output.', path: ['outputFormat'] });
  }
  if (config.responseSchema?.trim()) {
    try {
      const schema = parseResponseJsonSchema(config.responseSchema);
      if ((config.provider ?? 'gemini') === 'openai' && !isOpenAIStrictJsonSchema(schema)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'OpenAI JSON Schema output requires a closed object with every property required.', path: ['responseSchema'] });
      }
    } catch {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'The response schema must be supported JSON Schema.', path: ['responseSchema'] });
    }
  }
});

const aiClassificationConfigSchema = z.object({
  ...aiProviderConfigFields,
  input: z.string().max(16_384).optional(),
  labels: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
}).strict().superRefine(validateAIProviderSelection);

const aiExtractionConfigSchema = z.object({
  ...aiProviderConfigFields,
  input: z.string().max(16_384).optional(),
  instruction: z.string().max(4_096).optional(),
  responseSchema: z.string().max(8_192).optional(),
}).strict().superRefine((config, context) => {
  validateAIProviderSelection(config, context);
  if (config.responseSchema?.trim()) {
    try {
      const schema = parseResponseJsonSchema(config.responseSchema);
      if ((config.provider ?? 'gemini') === 'openai' && !isOpenAIStrictJsonSchema(schema)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'OpenAI JSON Schema output requires a closed object with every property required.', path: ['responseSchema'] });
      }
    } catch {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'The response schema must be supported JSON Schema.', path: ['responseSchema'] });
    }
  }
});

const aiSummarizationConfigSchema = z.object({
  ...aiProviderConfigFields,
  input: z.string().max(16_384).optional(),
  style: z.enum(['brief', 'detailed', 'bullets']).optional(),
}).strict().superRefine(validateAIProviderSelection);

const aiGenerationConfigSchema = aiCommonConfigSchema.extend(aiProviderConfigFields).strict().superRefine(validateAIProviderSelection);

const configSchemaByCategory: Record<NodeCategory, z.ZodTypeAny> = {
  manual_trigger: emptyConfigSchema,
  webhook_trigger: emptyConfigSchema,
  schedule_trigger: emptyConfigSchema,
  gemini_ai: geminiAIConfigSchema,
  ai_classification: aiClassificationConfigSchema,
  ai_extraction: aiExtractionConfigSchema,
  ai_summarization: aiSummarizationConfigSchema,
  ai_generation: aiGenerationConfigSchema,
  condition: conditionConfigSchema,
  switch: emptyConfigSchema,
  filter: filterConfigSchema,
  delay: emptyConfigSchema,
  send_email: emptyConfigSchema,
  http_request: httpRequestConfigSchema,
  create_db_record: emptyConfigSchema,
  update_db_record: emptyConfigSchema,
  webhook_action: webhookActionConfigSchema,
};

const workflowNodeSchema = z
  .object({
    id: workflowIdSchema,
    type: z.enum(nodeTypes),
    category: z.enum(nodeCategories),
    label: z.string().trim().min(1).max(200),
    position: positionSchema,
    config: z.record(z.unknown()),
  })
  .strict()
  .superRefine((node, context) => {
    if (NODE_TYPE_BY_CATEGORY[node.category] !== node.type) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Node type does not match its category.', path: ['type'] });
    }
    const configResult = configSchemaByCategory[node.category].safeParse(node.config);
    if (!configResult.success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Node configuration is invalid or contains unsupported fields.',
        path: ['config'],
      });
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
