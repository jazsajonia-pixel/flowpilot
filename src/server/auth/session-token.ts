import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'fp_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function readSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  let token: string | null = null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    if (token !== null) return null;
    const value = part.slice(separator + 1).trim();
    if (!SESSION_TOKEN_PATTERN.test(value)) return null;
    if (Buffer.from(value, 'base64url').toString('base64url') !== value) return null;
    token = value;
  }
  return token;
}

export function serializeSessionCookie(token: string, secure: boolean): string {
  if (!SESSION_TOKEN_PATTERN.test(token)) throw new Error('Invalid session token format.');
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure ? '; Secure' : ''}`;
}

export function serializeClearedSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? '; Secure' : ''}`;
}
