import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { AIProviderId } from '../../types/ai';

const CREDENTIAL_ENVELOPE_VERSION = 'v1';
const CREDENTIAL_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

export class CredentialEncryptionError extends Error {
  constructor() {
    super('The credential vault is unavailable.');
    this.name = 'CredentialEncryptionError';
  }
}

export interface CredentialContext {
  ownerId: string;
  credentialId: string;
  provider: AIProviderId;
}

function encryptionKey(encodedKey = process.env.CREDENTIAL_ENCRYPTION_KEY): Buffer {
  if (typeof encodedKey !== 'string') throw new CredentialEncryptionError();
  const normalized = encodedKey.trim();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(normalized)) throw new CredentialEncryptionError();
  const key = Buffer.from(normalized, 'base64');
  if (key.length !== CREDENTIAL_KEY_BYTES || key.toString('base64') !== normalized) {
    throw new CredentialEncryptionError();
  }
  return key;
}

function additionalAuthenticatedData(context: CredentialContext): Buffer {
  return Buffer.from(
    `flowpilot-credential:${CREDENTIAL_ENVELOPE_VERSION}:${context.ownerId}:${context.credentialId}:${context.provider}`,
    'utf8',
  );
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new CredentialEncryptionError();
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) throw new CredentialEncryptionError();
  return decoded;
}

export function encryptCredential(
  secret: string,
  context: CredentialContext,
  encodedKey?: string,
): string {
  if (secret.length < 16 || secret.length > 512 || /\s/.test(secret)) throw new CredentialEncryptionError();
  try {
    const iv = randomBytes(GCM_IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(encodedKey), iv);
    cipher.setAAD(additionalAuthenticatedData(context));
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      CREDENTIAL_ENVELOPE_VERSION,
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  } catch {
    throw new CredentialEncryptionError();
  }
}

export function decryptCredential(
  envelope: string,
  context: CredentialContext,
  encodedKey?: string,
): string {
  try {
    const [version, encodedIv, encodedTag, encodedCiphertext, ...extra] = envelope.split('.');
    if (version !== CREDENTIAL_ENVELOPE_VERSION || !encodedIv || !encodedTag || !encodedCiphertext || extra.length > 0) {
      throw new CredentialEncryptionError();
    }
    const iv = decodeBase64Url(encodedIv);
    const tag = decodeBase64Url(encodedTag);
    const ciphertext = decodeBase64Url(encodedCiphertext);
    if (iv.length !== GCM_IV_BYTES || tag.length !== GCM_TAG_BYTES || ciphertext.length === 0 || ciphertext.length > 512) {
      throw new CredentialEncryptionError();
    }
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(encodedKey), iv);
    decipher.setAAD(additionalAuthenticatedData(context));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    if (plaintext.length < 16 || plaintext.length > 512 || /\s/.test(plaintext)) throw new CredentialEncryptionError();
    return plaintext;
  } catch {
    throw new CredentialEncryptionError();
  }
}
