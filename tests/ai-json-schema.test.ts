import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseResponseJsonSchema, parseStructuredJsonResponse } from '../src/server/ai/json-schema';

const schemaText = JSON.stringify({
  type: 'object',
  properties: {
    name: { type: 'string' },
    score: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['name', 'score'],
  additionalProperties: false,
});

test('response schema parser accepts bounded JSON Schema and validates model output locally', () => {
  const schema = parseResponseJsonSchema(schemaText);
  assert.deepEqual(parseStructuredJsonResponse('{"name":"Ada","score":0.7}', schema), { name: 'Ada', score: 0.7 });
  assert.throws(() => parseStructuredJsonResponse('{"name":"Ada","score":2}', schema), /did not match/);
  assert.throws(() => parseStructuredJsonResponse('{"name":"Ada","score":0.7,"extra":true}', schema), /did not match/);
  assert.throws(() => parseStructuredJsonResponse('{"score":0.7}', schema), /did not match/);
});

test('response schema parser rejects prototype keys, unsupported keywords, and malformed JSON', () => {
  assert.throws(() => parseResponseJsonSchema('{"type":"object","properties":{"__proto__":{"type":"string"}}}'));
  assert.throws(() => parseResponseJsonSchema('{"type":"string","$ref":"#/definitions/secret"}'));
  assert.throws(() => parseResponseJsonSchema('{bad json'));
});

test('response schema parser bounds schema size and nesting depth', () => {
  assert.throws(() => parseResponseJsonSchema(' '.repeat(8_193)));
  let deep: Record<string, unknown> = { type: 'string' };
  for (let index = 0; index < 10; index += 1) deep = { type: 'array', items: deep };
  assert.throws(() => parseResponseJsonSchema(JSON.stringify(deep)), /too complex/);
});

test('structured output parser rejects malformed or oversized model responses', () => {
  assert.throws(() => parseStructuredJsonResponse('not json'));
  assert.throws(() => parseStructuredJsonResponse('x'.repeat(65 * 1024)));
});
