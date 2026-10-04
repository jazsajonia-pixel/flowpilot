import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseJsonBody, isSameOriginRequest } from '../src/server/auth/http';
import { hashPassword, verifyPassword } from '../src/server/auth/password';
import { logoutSchema, registrationSchema } from '../src/server/auth/validation';
import {
  createSessionToken,
  hashSessionToken,
  readSessionToken,
  serializeClearedSessionCookie,
  serializeSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from '../src/server/auth/session-token';

test('password hashes are salted and verify without accepting a wrong password', async () => {
  const password = 'correct horse battery staple';
  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);

  assert.notEqual(firstHash, secondHash);
  assert.match(firstHash, /^scrypt\$16384\$8\$5\$/);
  assert.equal(await verifyPassword(password, firstHash), true);
  assert.equal(await verifyPassword('incorrect password', firstHash), false);
  assert.equal(await verifyPassword(password, 'not-a-valid-hash'), false);
  assert.equal(
    await verifyPassword(
      'not-a-valid-account-password',
      'scrypt$16384$8$5$Zmxvd3BpbG90RHVtbXkwMQ$o9JbtKC0-RqodG0KJ9ORpon5WoK6Lw8ClZi21GXjm7Y1z50BxZ_61BVNvA2NiCHkVePXQROMC40LQvogglGQ_w',
    ),
    true,
  );
});

test('registration normalizes email and enforces password length by Unicode code point', () => {
  const accepted = registrationSchema.safeParse({
    email: '  FLOWPILOT@EXAMPLE.COM ',
    password: 'a'.repeat(15),
  });
  const unicodePassphrase = registrationSchema.safeParse({
    email: 'person@example.com',
    password: '😀'.repeat(15),
  });
  const tooShort = registrationSchema.safeParse({
    email: 'person@example.com',
    password: 'a'.repeat(14),
  });
  const untrustedIdentity = registrationSchema.safeParse({
    email: 'person@example.com',
    password: 'a'.repeat(15),
    ownerId: 'client-selected-user',
  });

  assert.equal(accepted.success, true);
  if (accepted.success) assert.equal(accepted.data.email, 'flowpilot@example.com');
  assert.equal(unicodePassphrase.success, true);
  assert.equal(tooShort.success, false);
  assert.equal(untrustedIdentity.success, false);
  assert.equal(logoutSchema.safeParse({}).success, true);
  assert.equal(logoutSchema.safeParse({ userId: 'attacker-selected-id' }).success, false);
});

test('session tokens are random, URL-safe, and stored as one-way digests', () => {
  const first = createSessionToken();
  const second = createSessionToken();
  const digest = hashSessionToken(first);

  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, first);
});

test('session cookie is HttpOnly, SameSite strict, path-scoped, and secure on HTTPS', () => {
  const token = createSessionToken();
  const cookie = serializeSessionCookie(token, true);

  assert.match(cookie, new RegExp(`^${SESSION_COOKIE_NAME}=`));
  assert.match(cookie, /; Path=\//);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Strict/);
  assert.match(cookie, /; Secure$/);
  assert.match(cookie, new RegExp(`; Max-Age=${SESSION_TTL_SECONDS}(?:;|$)`));
  assert.match(serializeClearedSessionCookie(true), /Max-Age=0/);
});

test('session cookie parsing rejects malformed and duplicate cookie values', () => {
  const token = createSessionToken();
  assert.equal(readSessionToken(`theme=dark; ${SESSION_COOKIE_NAME}=${token}`), token);
  assert.equal(readSessionToken(`${SESSION_COOKIE_NAME}=bad`), null);
  assert.equal(readSessionToken(`${SESSION_COOKIE_NAME}=${token}; ${SESSION_COOKIE_NAME}=${token}`), null);
  assert.equal(readSessionToken(null), null);
});

test('unsafe cross-origin requests are rejected', () => {
  const sameOrigin = new Request('https://flowpilot.example/api/auth/login', {
    method: 'POST',
    headers: { Origin: 'https://flowpilot.example' },
  });
  const crossOrigin = new Request('https://flowpilot.example/api/auth/login', {
    method: 'POST',
    headers: { Origin: 'https://evil.example' },
  });
  const missingOrigin = new Request('https://flowpilot.example/api/auth/login', { method: 'POST' });

  assert.equal(isSameOriginRequest(sameOrigin), true);
  assert.equal(isSameOriginRequest(crossOrigin), false);
  assert.equal(isSameOriginRequest(missingOrigin), false);
});

test('auth request parsing accepts JSON and rejects wrong content types, malformed JSON, and oversized bodies', async () => {
  const valid = new Request('https://flowpilot.example/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@example.test', password: 'sample' }),
  });
  const invalidType = new Request('https://flowpilot.example/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: '{}',
  });
  const malformed = new Request('https://flowpilot.example/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  const oversized = new Request('https://flowpilot.example/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: 'x'.repeat(9 * 1024) }),
  });

  assert.deepEqual(await parseJsonBody(valid), {
    ok: true,
    value: { email: 'a@example.test', password: 'sample' },
  });
  assert.equal((await parseJsonBody(invalidType)).ok, false);
  assert.equal((await parseJsonBody(malformed)).ok, false);
  const oversizedResult = await parseJsonBody(oversized);
  assert.equal(oversizedResult.ok, false);
  if (!oversizedResult.ok) assert.equal(oversizedResult.status, 413);
});
