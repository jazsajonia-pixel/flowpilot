import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { GenerateContentResponse } from '@google/genai';
import { AIProviderError, GeminiAIProvider, type GeminiGenerationClient } from '../src/server/ai/gemini-provider';

function response(text: string): GenerateContentResponse {
  return {
    text,
    modelVersion: 'gemini-3.8-flash',
    usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 5, totalTokenCount: 12 },
  } as unknown as GenerateContentResponse;
}

test('Gemini provider requires a server key and never reports key values', async () => {
  const provider = new GeminiAIProvider({ apiKey: '   ' });
  await assert.rejects(
    provider.generateCompletion({ prompt: 'hello' }),
    (error: unknown) => error instanceof AIProviderError && error.message === 'The built-in Gemini provider is not configured.',
  );
});

test('Gemini provider sends structured-output config and returns safe model/usage metadata', async () => {
  type Request = Parameters<GeminiGenerationClient['models']['generateContent']>[0];
  let request: Request | undefined;
  const client = {
    models: {
      generateContent: async (parameters: Request) => {
        request = parameters;
        return response('{"answer":"hello"}');
      },
    },
  } as unknown as GeminiGenerationClient;
  const signal = new AbortController().signal;
  const schema = {
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer'],
    additionalProperties: false,
  };
  const provider = new GeminiAIProvider({ apiKey: 'test-secret-not-for-logs', model: 'gemini-3.8-flash', client });
  const result = await provider.generateCompletion({
    prompt: 'return JSON',
    systemInstruction: 'Be concise.',
    temperature: 0.2,
    maxTokens: 256,
    outputFormat: 'json',
    responseJsonSchema: schema,
    abortSignal: signal,
  });

  assert.equal(request?.model, 'gemini-3.8-flash');
  assert.equal(request?.config?.responseMimeType, 'application/json');
  assert.deepEqual(request?.config?.responseJsonSchema, schema);
  assert.equal(request?.config?.abortSignal, signal);
  assert.equal(result.text, '{"answer":"hello"}');
  assert.equal(result.model, 'gemini-3.8-flash');
  assert.deepEqual(result.usage, { promptTokens: 7, completionTokens: 5, totalTokens: 12 });
  assert.equal(JSON.stringify(result).includes('test-secret-not-for-logs'), false);
});

test('Gemini provider reduces SDK errors to a fixed safe message', async () => {
  const client = {
    models: {
      generateContent: async () => { throw new Error('private response body and test-secret'); },
    },
  } as unknown as GeminiGenerationClient;
  const provider = new GeminiAIProvider({ apiKey: 'test-secret', client });
  await assert.rejects(
    provider.generateCompletion({ prompt: 'hello' }),
    (error: unknown) => error instanceof AIProviderError && error.message === 'The AI provider request failed.',
  );
});

test('Gemini provider short-circuits an already-aborted request', async () => {
  let called = false;
  const client = {
    models: {
      generateContent: async () => {
        called = true;
        return response('unused');
      },
    },
  } as unknown as GeminiGenerationClient;
  const controller = new AbortController();
  controller.abort();
  const provider = new GeminiAIProvider({ apiKey: 'test-secret', client });
  await assert.rejects(
    provider.generateCompletion({ prompt: 'hello', abortSignal: controller.signal }),
    (error: unknown) => error instanceof AIProviderError && error.message === 'The AI request timed out.',
  );
  assert.equal(called, false);
});

test('Gemini provider enforces prompt and token limits before calling the SDK', async () => {
  let called = false;
  const client = {
    models: {
      generateContent: async () => {
        called = true;
        return response('unused');
      },
    },
  } as unknown as GeminiGenerationClient;
  const provider = new GeminiAIProvider({ apiKey: 'test-secret', client });
  await assert.rejects(provider.generateCompletion({ prompt: 'x'.repeat(16_385) }), AIProviderError);
  await assert.rejects(provider.generateCompletion({ prompt: 'hello', maxTokens: 2_049 }), AIProviderError);
  assert.equal(called, false);
});
