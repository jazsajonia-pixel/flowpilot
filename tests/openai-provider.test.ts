import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AIProviderError } from '../src/server/ai/errors';
import { OpenAIProvider, type OpenAIResponsesClient } from '../src/server/ai/openai-provider';

const apiKey = 'sk-test-flowpilot-provider-key-123456';
const strictSchema = {
  type: 'object',
  properties: { label: { type: 'string', enum: ['support', 'billing'] }, confidence: { type: 'number', minimum: 0, maximum: 1 } },
  required: ['label', 'confidence'],
  additionalProperties: false,
};

test('OpenAI Responses provider sends bounded strict JSON requests and maps safe usage metadata', async () => {
  const calls: Array<{ params: unknown; signal?: AbortSignal }> = [];
  const client: OpenAIResponsesClient = {
    responses: {
      create: async (params, options) => {
        calls.push({ params, signal: options?.signal });
        return {
          output_text: '{"label":"support","confidence":0.9}',
          model: 'gpt-6-luna',
          usage: { input_tokens: 37, output_tokens: 12, total_tokens: 49 },
        };
      },
    },
  };
  const provider = new OpenAIProvider({ apiKey, client });
  const abortController = new AbortController();
  const result = await provider.generateCompletion({
    prompt: 'Classify a message',
    systemInstruction: 'Return one label.',
    model: 'gpt-6-luna',
    maxTokens: 200,
    outputFormat: 'json',
    responseJsonSchema: strictSchema,
    abortSignal: abortController.signal,
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.params, {
    model: 'gpt-6-luna',
    input: 'Classify a message',
    instructions: 'Return one label.',
    max_output_tokens: 200,
    text: { format: { type: 'json_schema', name: 'flowpilot_workflow_output', strict: true, schema: strictSchema } },
  });
  assert.equal(calls[0]?.signal, abortController.signal);
  assert.equal(result.text, '{"label":"support","confidence":0.9}');
  assert.equal(result.model, 'gpt-6-luna');
  assert.deepEqual(result.usage, { promptTokens: 37, completionTokens: 12, totalTokens: 49 });
});

test('OpenAI JSON mode without a schema and text mode select the expected request formats', async () => {
  const requests: unknown[] = [];
  const client: OpenAIResponsesClient = {
    responses: { create: async (params) => { requests.push(params); return { output_text: 'ok', model: params.model }; } },
  };
  const provider = new OpenAIProvider({ apiKey, client });
  await provider.generateCompletion({ prompt: 'Produce JSON', outputFormat: 'json' });
  await provider.generateCompletion({ prompt: 'Produce text', outputFormat: 'text' });

  assert.deepEqual((requests[0] as { text: unknown }).text, { format: { type: 'json_object' } });
  assert.match((requests[0] as { instructions: string }).instructions, /JSON/i);
  assert.equal('text' in (requests[1] as Record<string, unknown>), false);
});

test('OpenAI adapter rejects non-strict schemas and unsupported model IDs before a request', async () => {
  let calls = 0;
  const provider = new OpenAIProvider({
    apiKey,
    client: { responses: { create: async () => { calls += 1; return { output_text: 'ok' }; } } },
  });
  const optionalFieldSchema = {
    type: 'object',
    properties: { optional: { type: 'string' } },
    required: [],
    additionalProperties: false,
  };

  await assert.rejects(provider.generateCompletion({ prompt: 'extract', outputFormat: 'json', responseJsonSchema: optionalFieldSchema }), AIProviderError);
  await assert.rejects(provider.generateCompletion({ prompt: 'hello', model: 'arbitrary-model' }), AIProviderError);
  assert.equal(calls, 0);
});

test('OpenAI adapter rejects pre-aborted requests and never surfaces provider exception details', async () => {
  const secretError = `private SDK detail ${apiKey}`;
  const provider = new OpenAIProvider({
    apiKey,
    client: { responses: { create: async () => { throw new Error(secretError); } } },
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(provider.generateCompletion({ prompt: 'hello', abortSignal: controller.signal }), (error: unknown) =>
    error instanceof AIProviderError && error.message === 'The AI request timed out.' && !error.message.includes(apiKey));

  await assert.rejects(provider.generateCompletion({ prompt: 'hello' }), (error: unknown) =>
    error instanceof AIProviderError && error.message === 'The AI provider request failed.' && !error.message.includes(secretError));
});
