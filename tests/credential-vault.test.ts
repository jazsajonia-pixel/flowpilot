import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { decryptCredential, encryptCredential, CredentialEncryptionError, type CredentialContext } from '../src/server/ai/credential-vault';

const encryptionKey = Buffer.alloc(32, 0x42).toString('base64');
const context: CredentialContext = {
  ownerId: 'owner-123',
  credentialId: 'credential-456',
  provider: 'openai',
};
const secret = 'sk-test-secret-value-123456789';

test('credential vault encrypts and decrypts with a fresh authenticated envelope', () => {
  const first = encryptCredential(secret, context, encryptionKey);
  const second = encryptCredential(secret, context, encryptionKey);

  assert.notEqual(first, second);
  assert.equal(first.includes(secret), false);
  assert.equal(first.startsWith('v1.'), true);
  assert.equal(decryptCredential(first, context, encryptionKey), secret);
});

test('credential ciphertext is bound to its owner, record, provider, and encryption key', () => {
  const envelope = encryptCredential(secret, context, encryptionKey);
  assert.throws(() => decryptCredential(envelope, { ...context, ownerId: 'other-owner' }, encryptionKey), CredentialEncryptionError);
  assert.throws(() => decryptCredential(envelope, { ...context, credentialId: 'other-record' }, encryptionKey), CredentialEncryptionError);
  assert.throws(() => decryptCredential(envelope, { ...context, provider: 'gemini' }, encryptionKey), CredentialEncryptionError);
  assert.throws(() => decryptCredential(envelope, context, Buffer.alloc(32, 0x43).toString('base64')), CredentialEncryptionError);
});

test('credential vault rejects malformed master keys and envelopes with fixed generic errors', () => {
  assert.throws(() => encryptCredential(secret, context, 'not-a-key'), CredentialEncryptionError);
  assert.throws(() => decryptCredential('v2.not.valid', context, encryptionKey), CredentialEncryptionError);
  assert.throws(() => encryptCredential('too-short', context, encryptionKey), CredentialEncryptionError);
});
