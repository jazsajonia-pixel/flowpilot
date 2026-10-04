import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { encryptCredential } from '../src/server/ai/credential-vault';
import { AIProviderError } from '../src/server/ai/errors';
import { GeminiAIProvider } from '../src/server/ai/gemini-provider';
import { OpenAIProvider } from '../src/server/ai/openai-provider';
import { createOwnerAIProviderResolver } from '../src/server/ai/provider-resolver';

const ownerId = 'owner-123';
const credentialId = 'credential-456';
const encryptionKey = Buffer.alloc(32, 0x21).toString('base64');
const apiKey = 'sk-test-flowpilot-resolver-key-123';
const encryptedPayload = encryptCredential(apiKey, { ownerId, credentialId, provider: 'openai' }, encryptionKey);

test('provider resolver requests an owner/provider/ID match and creates the requested server adapter', async () => {
  const lookups: unknown[][] = [];
  const resolve = createOwnerAIProviderResolver(ownerId, async (...args) => {
    lookups.push(args);
    return { id: credentialId, ownerId, provider: 'openai', encryptedPayload };
  }, encryptionKey);

  const provider = await resolve({ provider: 'openai', credentialId, model: 'gpt-6-luna' });
  assert.equal(provider instanceof OpenAIProvider, true);
  assert.deepEqual(lookups, [[ownerId, credentialId, 'openai']]);
});

test('provider resolver rejects credentials returned for a different owner', async () => {
  const resolve = createOwnerAIProviderResolver(ownerId, async () => ({
    id: credentialId,
    ownerId: 'another-owner',
    provider: 'openai',
    encryptedPayload,
  }), encryptionKey);

  await assert.rejects(resolve({ provider: 'openai', credentialId }), (error: unknown) =>
    error instanceof AIProviderError && error.message === 'The selected AI provider credential is unavailable.');
});

test('OpenAI execution requires a credential while credentialless Gemini uses the server-managed provider', async () => {
  const resolve = createOwnerAIProviderResolver(ownerId, async () => null, encryptionKey);
  await assert.rejects(resolve({ provider: 'openai' }), AIProviderError);
  const builtinGemini = await resolve({ provider: 'gemini' });
  assert.equal(builtinGemini instanceof GeminiAIProvider, true);
});
