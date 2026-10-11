import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { decryptOAuthSecret, decryptOAuthTokens, encryptOAuthSecret, encryptOAuthTokens, OAuthVaultError, type OAuthTokenSet } from '../src/server/integrations/oauth-token-vault';

const key = Buffer.alloc(32, 17).toString('base64');
const context = { ownerId: 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0020', resourceId: 'integration:credential', provider: 'gmail' as const };

const tokens: OAuthTokenSet = {
  accessToken: 'access-token-example-0123456789',
  refreshToken: 'refresh-token-example-0123456789',
  accessTokenExpiresAt: 1_800_000_000_000,
  refreshTokenExpiresAt: 1_802_000_000_000,
  tokenType: 'Bearer',
  scopes: ['openid', 'email'],
};

test('OAuth verifier envelopes are authenticated, opaque, and context-bound', () => {
  const envelope = encryptOAuthSecret('pkce-verifier-value-0123456789', context, key);
  assert.equal(envelope.includes('pkce-verifier-value'), false);
  assert.equal(decryptOAuthSecret(envelope, context, key), 'pkce-verifier-value-0123456789');
  assert.throws(() => decryptOAuthSecret(envelope, { ...context, ownerId: 'other-user' }, key), OAuthVaultError);
  assert.throws(() => decryptOAuthSecret(envelope, { ...context, provider: 'slack' }, key), OAuthVaultError);
  assert.throws(() => decryptOAuthSecret(envelope, { ...context, resourceId: 'other-row' }, key), OAuthVaultError);
  assert.throws(() => decryptOAuthSecret(`${envelope.slice(0, -1)}x`, context, key), OAuthVaultError);
});

test('OAuth token bundles round-trip as encrypted JSON and never expose token values in the envelope', () => {
  const envelope = encryptOAuthTokens(tokens, context, key);
  assert.equal(envelope.includes(tokens.accessToken), false);
  assert.equal(envelope.includes(tokens.refreshToken ?? ''), false);
  assert.deepEqual(decryptOAuthTokens(envelope, context, key), tokens);
  assert.throws(() => decryptOAuthTokens(envelope, { ...context, ownerId: 'other-user' }, key), OAuthVaultError);
});

test('OAuth vault rejects malformed keys, oversized secrets, and malformed token sets', () => {
  assert.throws(() => encryptOAuthSecret('secret-value', context, 'not-a-key'), OAuthVaultError);
  assert.throws(() => encryptOAuthSecret('x'.repeat(24 * 1024 + 1), context, key), OAuthVaultError);
  assert.throws(() => encryptOAuthTokens({ ...tokens, accessToken: 'contains space in token' }, context, key), OAuthVaultError);
});
