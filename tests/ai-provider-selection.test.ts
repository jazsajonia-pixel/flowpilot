import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { workflowGraphSchema } from '../src/server/workflows/graph-validation';

const credentialId = 'c1d6b0d0-2ce8-4f58-8e60-59f249c33971';
const nodeId = '6c4ff5d9-3fa8-43e8-a1a3-8ed251b5f3ab';

function validateNode(category: string, config: Record<string, unknown>) {
  return workflowGraphSchema.safeParse({
    nodes: [{ id: nodeId, type: 'ai', category, label: 'AI node', position: { x: 0, y: 0 }, config }],
    connections: [],
  });
}

test('graph schema accepts owner credential references and curated provider-specific model IDs', () => {
  assert.equal(validateNode('gemini_ai', { provider: 'gemini', credentialId, model: 'gemini-3.8-flash', prompt: 'Hello' }).success, true);
  assert.equal(validateNode('ai_generation', { provider: 'openai', credentialId, model: 'gpt-6-luna', prompt: 'Hello' }).success, true);
  assert.equal(validateNode('ai_summarization', { provider: 'openai', credentialId, model: 'gpt-6.1-sol', input: 'Text' }).success, true);
});

test('graph schema rejects mismatched model/provider pairs and arbitrary model IDs', () => {
  assert.equal(validateNode('gemini_ai', { provider: 'openai', credentialId, model: 'gemini-3.8-flash', prompt: 'Hello' }).success, false);
  assert.equal(validateNode('ai_generation', { provider: 'openai', credentialId, model: 'made-up-model', prompt: 'Hello' }).success, false);
  assert.equal(validateNode('ai_generation', { provider: 'custom', model: 'gpt-6-luna', prompt: 'Hello' }).success, false);
});

test('OpenAI extraction requires a closed object schema with all properties required', () => {
  const strictSchema = JSON.stringify({
    type: 'object',
    properties: { email: { type: 'string' } },
    required: ['email'],
    additionalProperties: false,
  });
  const incompatibleSchema = JSON.stringify({
    type: 'object',
    properties: { email: { type: 'string' }, phone: { type: 'string' } },
    required: ['email'],
    additionalProperties: false,
  });

  assert.equal(validateNode('ai_extraction', { provider: 'openai', credentialId, model: 'gpt-6-luna', input: 'Text', responseSchema: strictSchema }).success, true);
  assert.equal(validateNode('ai_extraction', { provider: 'openai', credentialId, model: 'gpt-6-luna', input: 'Text', responseSchema: incompatibleSchema }).success, false);
});
