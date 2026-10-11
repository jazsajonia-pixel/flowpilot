import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { OAuthProviderId } from '../../types/integrations';

const VERSION = 'o1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_PLAINTEXT_BYTES = 24 * 1024;

export class OAuthVaultError extends Error {
  constructor() {
    super('OAuth token vault is unavailable.');
    this.name = 'OAuthVaultError';
  }
}

export interface OAuthSecretContext {
  ownerId: string;
  resourceId: string;
  provider: OAuthProviderId;
}

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: number | null;
  refreshTokenExpiresAt: number | null;
  tokenType: string;
  scopes: string[];
}

const tokenSetSchema = z.object({
  accessToken: z.string().min(1).max(12_000).regex(/^[\x21-\x7e]+$/),
  refreshToken: z.string().min(1).max(12_000).regex(/^[\x21-\x7e]+$/).nullable(),
  accessTokenExpiresAt: z.number().int().positive().nullable(),
  refreshTokenExpiresAt: z.number().int().positive().nullable(),
  tokenType: z.string().min(1).max(64),
  scopes: z.array(z.string().min(1).max(256)).max(64),
}).strict();

function encryptionKey(encodedKey = process.env.CREDENTIAL_ENCRYPTION_KEY): Buffer {
  if (typeof encodedKey !== 'string') throw new OAuthVaultError();
  const normalized = encodedKey.trim();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(normalized)) throw new OAuthVaultError();
  const key = Buffer.from(normalized, 'base64');
  if (key.length !== KEY_BYTES || key.toString('base64') !== normalized) throw new OAuthVaultError();
  return key;
}

function aad(context: OAuthSecretContext): Buffer {
  return Buffer.from(`flowpilot-oauth:${VERSION}:${context.ownerId}:${context.resourceId}:${context.provider}`, 'utf8');
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new OAuthVaultError();
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) throw new OAuthVaultError();
  return bytes;
}

export function encryptOAuthSecret(secret: string, context: OAuthSecretContext, encodedKey?: string): string {
  const plaintext = Buffer.from(secret, 'utf8');
  if (plaintext.length === 0 || plaintext.length > MAX_PLAINTEXT_BYTES) throw new OAuthVaultError();
  try {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(encodedKey), iv);
    cipher.setAAD(aad(context));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
  } catch {
    throw new OAuthVaultError();
  }
}

export function decryptOAuthSecret(envelope: string, context: OAuthSecretContext, encodedKey?: string): string {
  try {
    const [version, encodedIv, encodedTag, encodedCiphertext, ...extra] = envelope.split('.');
    if (version !== VERSION || !encodedIv || !encodedTag || !encodedCiphertext || extra.length) throw new OAuthVaultError();
    const iv = decodeBase64Url(encodedIv);
    const tag = decodeBase64Url(encodedTag);
    const ciphertext = decodeBase64Url(encodedCiphertext);
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length === 0 || ciphertext.length > MAX_PLAINTEXT_BYTES) throw new OAuthVaultError();
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(encodedKey), iv);
    decipher.setAAD(aad(context));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (!plaintext.length || plaintext.length > MAX_PLAINTEXT_BYTES) throw new OAuthVaultError();
    return plaintext.toString('utf8');
  } catch {
    throw new OAuthVaultError();
  }
}

export function encryptOAuthTokens(tokens: OAuthTokenSet, context: OAuthSecretContext, encodedKey?: string): string {
  const parsed = tokenSetSchema.safeParse(tokens);
  if (!parsed.success) throw new OAuthVaultError();
  return encryptOAuthSecret(JSON.stringify(parsed.data), context, encodedKey);
}

export function decryptOAuthTokens(envelope: string, context: OAuthSecretContext, encodedKey?: string): OAuthTokenSet {
  const plaintext = decryptOAuthSecret(envelope, context, encodedKey);
  try {
    const parsed = tokenSetSchema.safeParse(JSON.parse(plaintext) as unknown);
    if (!parsed.success) throw new OAuthVaultError();
    return parsed.data;
  } catch {
    throw new OAuthVaultError();
  }
}
