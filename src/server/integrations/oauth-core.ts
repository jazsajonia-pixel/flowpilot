import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { isSameOriginRequest, isSecureRequest, jsonResponse } from '../auth/http';
import { decryptOAuthSecret, decryptOAuthTokens, encryptOAuthSecret, encryptOAuthTokens, OAuthVaultError, type OAuthTokenSet } from './oauth-token-vault';
import { buildAuthorizationUrl, getOAuthProviderConfig, getOAuthProviderStatuses, type OAuthEnvironment, type OAuthProviderConfig } from './oauth-providers';
import type { ConnectedIntegration, OAuthProviderId, OAuthProviderStatus } from '../../types/integrations';
import type { ConsumedOAuthState, NewOAuthState, OAuthAccountInput, RemovedOAuthAccount, StoredOAuthCredential } from './oauth-repository';

const STATE_TTL_MS = 10 * 60 * 1000;
const COOKIE_TTL_SECONDS = 600;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1024;
const OAUTH_TOKEN_REFRESH_SKEW_MS = 60_000;
const SAFE_RANDOM_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const stateSchema = z.string().regex(SAFE_RANDOM_PATTERN);
const codeSchema = z.string().min(1).max(4096).regex(/^[\x21-\x7e]+$/);
const accountIdSchema = z.string().uuid();

export interface OAuthActor {
  ownerId: string;
  sessionTokenHash: string;
}

export interface OAuthRepository {
  createState(record: NewOAuthState, now: Date): Promise<boolean>;
  consumeState(stateHash: string, provider: OAuthProviderId, browserBindingHash: string, now: Date): Promise<ConsumedOAuthState | null>;
  isSessionActive(ownerId: string, tokenHash: string, now: Date): Promise<boolean>;
  listAccounts(ownerId: string): Promise<ConnectedIntegration[]>;
  saveAccount(input: OAuthAccountInput): Promise<ConnectedIntegration>;
  getCredential(ownerId: string, provider: OAuthProviderId, integrationId: string): Promise<StoredOAuthCredential | null>;
  compareAndSwapTokens(record: StoredOAuthCredential, encryptedPayload: string, tokens: OAuthTokenSet, now: Date): Promise<boolean>;
  markReauthRequired(ownerId: string, provider: OAuthProviderId, integrationId: string, now: Date): Promise<void>;
  removeAccount(ownerId: string, provider: OAuthProviderId, integrationId: string): Promise<RemovedOAuthAccount | null>;
}

export interface OAuthServiceDependencies {
  repository: OAuthRepository;
  authenticate: (request: Request) => Promise<OAuthActor | null>;
  getProviderConfig?: (provider: string) => OAuthProviderConfig | null;
  getProviderStatuses?: (env?: OAuthEnvironment) => OAuthProviderStatus[];
  env?: OAuthEnvironment;
  fetch?: typeof fetch;
  now?: () => Date;
  random?: () => string;
  createId?: () => string;
  encryptSecret?: typeof encryptOAuthSecret;
  decryptSecret?: typeof decryptOAuthSecret;
  encryptTokens?: typeof encryptOAuthTokens;
  decryptTokens?: typeof decryptOAuthTokens;
}

export class OAuthOperationError extends Error {
  constructor(message = 'OAuth operation failed.') {
    super(message);
    this.name = 'OAuthOperationError';
  }
}

class OAuthTokenEndpointError extends Error {
  constructor(readonly code: string | null) {
    super();
    this.name = 'OAuthTokenEndpointError';
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function createRandom(): string {
  return randomBytes(32).toString('base64url');
}

function cookieName(provider: OAuthProviderId, stateHash: string): string {
  return `fp_oauth_${provider}_${stateHash}`;
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  let found: string | null = null;
  for (const piece of cookieHeader.split(';')) {
    const separator = piece.indexOf('=');
    if (separator < 0 || piece.slice(0, separator).trim() !== name) continue;
    if (found !== null) return null;
    found = piece.slice(separator + 1).trim();
  }
  if (!found || !SAFE_RANDOM_PATTERN.test(found) || Buffer.from(found, 'base64url').toString('base64url') !== found) return null;
  return found;
}

function serializeBindingCookie(provider: OAuthProviderId, stateHash: string, value: string, request: Request): string {
  const secure = isSecureRequest(request) ? '; Secure' : '';
  return `${cookieName(provider, stateHash)}=${value}; Path=/api/integrations/oauth/${provider}/callback; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_TTL_SECONDS}${secure}`;
}

function serializeClearedBindingCookie(provider: OAuthProviderId, stateHash: string, request: Request): string {
  const secure = isSecureRequest(request) ? '; Secure' : '';
  return `${cookieName(provider, stateHash)}=; Path=/api/integrations/oauth/${provider}/callback; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}

function redirectResponse(baseUrl: string, result: 'connected' | 'failed' | 'denied' | 'expired', provider: OAuthProviderId, cookie?: string): Response {
  const target = new URL('/integrations', baseUrl);
  target.searchParams.set('oauth', result);
  target.searchParams.set('provider', provider);
  const headers = new Headers({ Location: target.toString(), 'Cache-Control': 'no-store', Pragma: 'no-cache', 'Referrer-Policy': 'no-referrer' });
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
}

function originFromStoredRedirect(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !localHost) return null;
    if (parsed.pathname !== '/api/integrations/oauth/gmail/callback' && parsed.pathname !== '/api/integrations/oauth/slack/callback' && parsed.pathname !== '/api/integrations/oauth/airtable/callback') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function providerFromId(value: string): OAuthProviderId | null {
  return value === 'gmail' || value === 'slack' || value === 'airtable' ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function providerErrorCode(value: unknown): string | null {
  const code = asRecord(value)?.error;
  return typeof code === 'string' && /^[a-z0-9_]{1,64}$/i.test(code) ? code.toLowerCase() : null;
}

function isPermanentRefreshRejection(error: unknown): boolean {
  return error instanceof OAuthTokenEndpointError
    && ['invalid_grant', 'invalid_refresh_token', 'token_revoked'].includes(error.code ?? '');
}

function parseTokenResponse(value: unknown, provider: OAuthProviderConfig, now: Date, previousTokens?: OAuthTokenSet): OAuthTokenSet {
  const record = asRecord(value);
  if (!record || record.ok === false || typeof record.error === 'string') throw new OAuthOperationError();
  const accessToken = typeof record.access_token === 'string' ? record.access_token : '';
  const refreshToken = typeof record.refresh_token === 'string' && record.refresh_token.length > 0
    ? record.refresh_token
    : previousTokens?.refreshToken ?? null;
  const expiresIn = typeof record.expires_in === 'number' && Number.isFinite(record.expires_in) && record.expires_in > 0 && record.expires_in <= 31_536_000
    ? record.expires_in
    : null;
  const refreshExpiresIn = typeof record.refresh_expires_in === 'number' && Number.isFinite(record.refresh_expires_in) && record.refresh_expires_in > 0 && record.refresh_expires_in <= 31_536_000
    ? record.refresh_expires_in
    : null;
  const rawScope = typeof record.scope === 'string' ? record.scope : '';
  const responseScopes = rawScope ? rawScope.split(provider.scopeDelimiter).map((scope) => scope.trim()).filter(Boolean) : [];
  const scopes = [...new Set(responseScopes.length ? responseScopes : previousTokens?.scopes ?? provider.scopes)];
  const tokenType = typeof record.token_type === 'string' && record.token_type.trim() ? record.token_type.trim().slice(0, 64) : previousTokens?.tokenType ?? 'Bearer';
  if (!/^[\x21-\x7e]{1,12000}$/.test(accessToken) || (refreshToken !== null && !/^[\x21-\x7e]{1,12000}$/.test(refreshToken))) throw new OAuthOperationError();
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: expiresIn === null ? null : now.getTime() + expiresIn * 1000,
    refreshTokenExpiresAt: refreshExpiresIn === null ? previousTokens?.refreshTokenExpiresAt ?? null : now.getTime() + refreshExpiresIn * 1000,
    tokenType,
    scopes: scopes.slice(0, 64),
  };
}

function tokenRequest(provider: OAuthProviderConfig, grant: 'authorization_code' | 'refresh_token', values: Record<string, string>): RequestInit {
  const form = new URLSearchParams({ ...values, grant_type: grant });
  const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' });

  if (provider.tokenAuth === 'basic-if-secret' && provider.clientSecret) {
    headers.set('Authorization', `Basic ${Buffer.from(`${provider.clientId}:${provider.clientSecret}`).toString('base64url')}`);
  }
  if (provider.id === 'airtable' && !provider.clientSecret) form.set('client_id', provider.clientId);
  if (provider.id !== 'airtable' || !provider.clientSecret) form.set('client_id', provider.clientId);

  if (provider.id === 'gmail') {
    if (provider.clientSecret) form.set('client_secret', provider.clientSecret);
  } else if (provider.id === 'slack') {
    if (!provider.pkceEnabled && provider.clientSecret) form.set('client_secret', provider.clientSecret);
  }

  return {
    method: 'POST',
    headers,
    body: form,
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
}

async function readProviderJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_RESPONSE_BYTES) throw new OAuthOperationError();
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_PROVIDER_RESPONSE_BYTES) throw new OAuthOperationError();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new OAuthOperationError();
  }
}

async function exchangeCode(provider: OAuthProviderConfig, code: string, verifier: string, fetchImpl: typeof fetch, now: Date): Promise<{ tokens: OAuthTokenSet; response: Record<string, unknown> }> {
  const fields: Record<string, string> = { code, redirect_uri: provider.redirectUri };
  if (provider.pkceEnabled) fields.code_verifier = verifier;
  const response = await fetchImpl(provider.tokenEndpoint, tokenRequest(provider, 'authorization_code', fields));
  const body = await readProviderJson(response);
  if (!response.ok) throw new OAuthOperationError();
  const record = asRecord(body);
  if (!record) throw new OAuthOperationError();
  return { tokens: parseTokenResponse(record, provider, now), response: record };
}

async function refreshTokens(provider: OAuthProviderConfig, old: OAuthTokenSet, fetchImpl: typeof fetch, now: Date): Promise<OAuthTokenSet> {
  if (!old.refreshToken) throw new OAuthOperationError();
  const fields: Record<string, string> = { refresh_token: old.refreshToken };
  const response = await fetchImpl(provider.tokenEndpoint, tokenRequest(provider, 'refresh_token', fields));
  const body = await readProviderJson(response);
  const record = asRecord(body);
  const errorCode = providerErrorCode(body);
  if (!response.ok || record?.ok === false || errorCode) throw new OAuthTokenEndpointError(errorCode);
  return parseTokenResponse(record, provider, now, old);
}

async function accountIdentity(provider: OAuthProviderConfig, tokens: OAuthTokenSet, body: Record<string, unknown>, fetchImpl: typeof fetch): Promise<{ name: string; providerAccountId: string | null }> {
  if (provider.id === 'gmail') {
    try {
      const response = await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const info = asRecord(await readProviderJson(response));
      if (response.ok && info && typeof info.email === 'string') {
        const id = typeof info.sub === 'string' ? info.sub : null;
        return { name: info.email.slice(0, 120), providerAccountId: id };
      }
    } catch {
      // Profile data is display-only; a valid token grant remains usable without it.
    }
    return { name: 'Google account', providerAccountId: null };
  }

  if (provider.id === 'slack') {
    const team = asRecord(body.team);
    const name = team && typeof team.name === 'string' ? team.name.trim().slice(0, 120) : '';
    const id = team && typeof team.id === 'string' ? team.id.slice(0, 256) : null;
    return { name: name || 'Slack workspace', providerAccountId: id };
  }

  return { name: 'Airtable account', providerAccountId: null };
}

async function revokeToken(provider: OAuthProviderConfig | null, providerId: OAuthProviderId, tokens: OAuthTokenSet, fetchImpl: typeof fetch): Promise<'confirmed' | 'unavailable' | 'unconfirmed'> {
  const endpoint = provider?.revocationEndpoint;
  if (!endpoint) return providerId === 'airtable' ? 'unavailable' : 'unconfirmed';
  try {
    if (providerId === 'slack') {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.accessToken}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ token: tokens.accessToken }),
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = asRecord(await readProviderJson(response));
      return response.ok && body?.ok === true && body.revoked === true ? 'confirmed' : 'unconfirmed';
    }
    const token = tokens.refreshToken ?? tokens.accessToken;
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ token }),
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.ok ? 'confirmed' : 'unconfirmed';
  } catch {
    return 'unconfirmed';
  }
}

export function createOAuthService(dependencies: OAuthServiceDependencies) {
  const repository = dependencies.repository;
  const now = dependencies.now ?? (() => new Date());
  const random = dependencies.random ?? createRandom;
  const createId = dependencies.createId ?? randomUUID;
  const fetchImpl = dependencies.fetch ?? fetch;
  const env = dependencies.env ?? process.env;
  const providerConfig = dependencies.getProviderConfig ?? ((id: string) => getOAuthProviderConfig(id, env));
  const providerStatuses = dependencies.getProviderStatuses ?? (() => getOAuthProviderStatuses(env));
  const encryptSecret = dependencies.encryptSecret ?? encryptOAuthSecret;
  const decryptSecret = dependencies.decryptSecret ?? decryptOAuthSecret;
  const encryptTokens = dependencies.encryptTokens ?? encryptOAuthTokens;
  const decryptTokens = dependencies.decryptTokens ?? decryptOAuthTokens;

  async function list(request: Request): Promise<Response> {
    if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    try {
      const actor = await dependencies.authenticate(request);
      if (!actor) return jsonResponse(401, { error: 'Authentication required.' });
      const accounts = await repository.listAccounts(actor.ownerId);
      return jsonResponse(200, { providers: providerStatuses(env), accounts });
    } catch {
      return jsonResponse(503, { error: 'Integration service unavailable.' });
    }
  }

  async function start(request: Request, providerValue: string): Promise<Response> {
    if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (!isSameOriginRequest(request)) return jsonResponse(403, { error: 'Cross-origin request rejected.' });
    const providerId = providerFromId(providerValue);
    if (!providerId) return jsonResponse(404, { error: 'Integration provider not found.' });

    try {
      const actor = await dependencies.authenticate(request);
      if (!actor) return jsonResponse(401, { error: 'Authentication required.' });
      const provider = providerConfig(providerId);
      if (!provider) return jsonResponse(503, { error: 'This provider is not configured yet.' });
      const state = random();
      const verifier = random();
      const browserBinding = random();
      if (!SAFE_RANDOM_PATTERN.test(state) || !SAFE_RANDOM_PATTERN.test(verifier) || !SAFE_RANDOM_PATTERN.test(browserBinding)) {
        return jsonResponse(503, { error: 'OAuth could not be started.' });
      }
      const stateHash = sha256(state);
      const id = createId();
      const context = { ownerId: actor.ownerId, resourceId: `oauth-state:${id}`, provider: providerId } as const;
      const encryptedCodeVerifier = encryptSecret(verifier, context);
      const record: NewOAuthState = {
        id,
        ownerId: actor.ownerId,
        provider: providerId,
        stateHash,
        sessionTokenHash: actor.sessionTokenHash,
        browserBindingHash: sha256(browserBinding),
        encryptedCodeVerifier,
        redirectUri: provider.redirectUri,
        expiresAt: new Date(now().getTime() + STATE_TTL_MS),
      };
      if (!(await repository.createState(record, now()))) return jsonResponse(429, { error: 'Too many pending connection attempts. Try again shortly.' });
      const codeChallenge = createHash('sha256').update(verifier).digest('base64url');
      const authorizationUrl = buildAuthorizationUrl(provider, state, codeChallenge);
      return jsonResponse(200, { authorizationUrl }, {
        'Set-Cookie': serializeBindingCookie(providerId, stateHash, browserBinding, request),
        'Referrer-Policy': 'no-referrer',
      });
    } catch (error) {
      if (error instanceof OAuthVaultError) return jsonResponse(503, { error: 'OAuth token vault is not configured.' });
      return jsonResponse(503, { error: 'OAuth could not be started.' });
    }
  }

  async function callback(request: Request, providerValue: string): Promise<Response> {
    if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const providerId = providerFromId(providerValue);
    if (!providerId) return jsonResponse(404, { error: 'Integration provider not found.' });
    let url: URL;
    try { url = new URL(request.url); } catch { return jsonResponse(400, { error: 'OAuth callback is invalid.' }); }
    const stateValues = url.searchParams.getAll('state');
    if (stateValues.length !== 1 || !stateSchema.safeParse(stateValues[0]).success) return jsonResponse(400, { error: 'OAuth callback is invalid.' });
    const state = stateValues[0];
    const stateHash = sha256(state);
    const binding = readCookie(request.headers.get('cookie'), cookieName(providerId, stateHash));
    if (!binding) return jsonResponse(400, { error: 'OAuth callback could not be verified.' });

    let stateRecord: ConsumedOAuthState | null;
    try {
      stateRecord = await repository.consumeState(stateHash, providerId, sha256(binding), now());
    } catch {
      return jsonResponse(503, { error: 'Integration service unavailable.' });
    }
    const clearCookie = serializeClearedBindingCookie(providerId, stateHash, request);
    if (!stateRecord) return jsonResponse(400, { error: 'OAuth callback could not be verified.' }, { 'Set-Cookie': clearCookie });
    const redirectBase = originFromStoredRedirect(stateRecord.redirectUri);
    if (!redirectBase) return jsonResponse(400, { error: 'OAuth callback is invalid.' }, { 'Set-Cookie': clearCookie });

    try {
      const stillActive = await repository.isSessionActive(stateRecord.ownerId, stateRecord.sessionTokenHash, now());
      if (!stillActive) return redirectResponse(redirectBase, 'expired', providerId, clearCookie);
      const provider = providerConfig(providerId);
      if (!provider || provider.redirectUri !== stateRecord.redirectUri) return redirectResponse(redirectBase, 'failed', providerId, clearCookie);

      const providerErrors = url.searchParams.getAll('error');
      if (providerErrors.length > 0) return redirectResponse(redirectBase, 'denied', providerId, clearCookie);
      const codeValues = url.searchParams.getAll('code');
      if (codeValues.length !== 1 || !codeSchema.safeParse(codeValues[0]).success) return redirectResponse(redirectBase, 'failed', providerId, clearCookie);

      const verifierContext = { ownerId: stateRecord.ownerId, resourceId: `oauth-state:${stateRecord.id}`, provider: providerId } as const;
      const verifier = decryptSecret(stateRecord.encryptedCodeVerifier, verifierContext);
      if (providerId === 'airtable') {
        const challenges = url.searchParams.getAll('code_challenge');
        const methods = url.searchParams.getAll('code_challenge_method');
        const expectedChallenge = createHash('sha256').update(verifier).digest('base64url');
        if (challenges.length !== 1 || challenges[0] !== expectedChallenge || methods.length !== 1 || methods[0] !== 'S256') {
          return redirectResponse(redirectBase, 'failed', providerId, clearCookie);
        }
      }
      const exchanged = await exchangeCode(provider, codeValues[0], verifier, fetchImpl, now());
      const identity = await accountIdentity(provider, exchanged.tokens, exchanged.response, fetchImpl);
      await repository.saveAccount({
        ownerId: stateRecord.ownerId,
        provider: providerId,
        displayName: identity.name,
        providerAccountId: identity.providerAccountId,
        tokens: exchanged.tokens,
        now: now(),
      });
      return redirectResponse(redirectBase, 'connected', providerId, clearCookie);
    } catch (error) {
      if (error instanceof OAuthVaultError) return redirectResponse(redirectBase, 'failed', providerId, clearCookie);
      return redirectResponse(redirectBase, 'failed', providerId, clearCookie);
    }
  }

  async function disconnect(request: Request, providerValue: string, integrationIdValue: string): Promise<Response> {
    if (request.method !== 'DELETE') return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'DELETE' });
    if (!isSameOriginRequest(request)) return jsonResponse(403, { error: 'Cross-origin request rejected.' });
    const providerId = providerFromId(providerValue);
    if (!providerId || !accountIdSchema.safeParse(integrationIdValue).success) return jsonResponse(404, { error: 'Connected account not found.' });
    try {
      const actor = await dependencies.authenticate(request);
      if (!actor) return jsonResponse(401, { error: 'Authentication required.' });
      const removed = await repository.removeAccount(actor.ownerId, providerId, integrationIdValue);
      if (!removed) return jsonResponse(404, { error: 'Connected account not found.' });
      let remoteRevocation: 'confirmed' | 'unavailable' | 'unconfirmed' = providerId === 'airtable' ? 'unavailable' : 'unconfirmed';
      if (removed.encryptedPayload && removed.credentialId) {
        try {
          const tokens = decryptTokens(removed.encryptedPayload, {
            ownerId: actor.ownerId,
            resourceId: `${removed.id}:${removed.credentialId}`,
            provider: providerId,
          });
          remoteRevocation = await revokeToken(providerConfig(providerId), providerId, tokens, fetchImpl);
        } catch {
          remoteRevocation = 'unconfirmed';
        }
      }
      return jsonResponse(200, { ok: true, remoteRevocation });
    } catch {
      return jsonResponse(503, { error: 'Integration service unavailable.' });
    }
  }

  async function getValidAccessToken(ownerId: string, providerValue: string, integrationId: string): Promise<string> {
    const providerId = providerFromId(providerValue);
    if (!providerId) throw new OAuthOperationError('Unsupported OAuth provider.');
    const record = await repository.getCredential(ownerId, providerId, integrationId);
    if (!record || record.status !== 'connected') throw new OAuthOperationError('OAuth connection is unavailable.');
    const context = { ownerId, resourceId: `${record.integrationId}:${record.credentialId}`, provider: providerId } as const;
    const oldTokens = decryptTokens(record.encryptedPayload, context);
    const currentTime = now();
    if (oldTokens.accessTokenExpiresAt === null || oldTokens.accessTokenExpiresAt > currentTime.getTime() + OAUTH_TOKEN_REFRESH_SKEW_MS) return oldTokens.accessToken;
    const provider = providerConfig(providerId);
    if (!oldTokens.refreshToken || !provider || (oldTokens.refreshTokenExpiresAt !== null && oldTokens.refreshTokenExpiresAt <= currentTime.getTime())) {
      await repository.markReauthRequired(ownerId, providerId, integrationId, currentTime);
      throw new OAuthOperationError('OAuth connection requires reauthorization.');
    }

    try {
      const freshTokens = await refreshTokens(provider, oldTokens, fetchImpl, now());
      const envelope = encryptTokens(freshTokens, context);
      const saved = await repository.compareAndSwapTokens(record, envelope, freshTokens, now());
      if (saved) return freshTokens.accessToken;
      const currentRecord = await repository.getCredential(ownerId, providerId, integrationId);
      if (currentRecord) {
        const winner = decryptTokens(currentRecord.encryptedPayload, {
          ownerId,
          resourceId: `${currentRecord.integrationId}:${currentRecord.credentialId}`,
          provider: providerId,
        });
        if (winner.accessTokenExpiresAt === null || winner.accessTokenExpiresAt > now().getTime() + OAUTH_TOKEN_REFRESH_SKEW_MS) return winner.accessToken;
      }
      throw new OAuthOperationError('OAuth token refresh could not be saved.');
    } catch (error) {
      const latest = await repository.getCredential(ownerId, providerId, integrationId).catch(() => null);
      if (latest && latest.encryptedPayload !== record.encryptedPayload) {
        try {
          const winner = decryptTokens(latest.encryptedPayload, {
            ownerId,
            resourceId: `${latest.integrationId}:${latest.credentialId}`,
            provider: providerId,
          });
          if (winner.accessTokenExpiresAt === null || winner.accessTokenExpiresAt > now().getTime() + OAUTH_TOKEN_REFRESH_SKEW_MS) return winner.accessToken;
        } catch {
          // Fail closed if the account was disconnected or the competing refresh could not be decrypted.
        }
      }
      if (isPermanentRefreshRejection(error)) {
        try {
          await repository.markReauthRequired(ownerId, providerId, integrationId, now());
        } catch {
          // Keep the provider response opaque; the next attempt will still fail closed.
        }
      }
      throw new OAuthOperationError('OAuth token refresh failed. Reconnect the provider if the problem continues.');
    }
  }

  return { list, start, callback, disconnect, getValidAccessToken };
}
