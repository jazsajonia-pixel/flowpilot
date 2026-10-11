import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import type { ConnectedIntegration, OAuthProviderId } from '../src/types/integrations';
import { createOAuthService, OAuthOperationError, type OAuthActor, type OAuthRepository, type OAuthServiceDependencies } from '../src/server/integrations/oauth-core';
import { getOAuthProviderStatuses, type OAuthEnvironment } from '../src/server/integrations/oauth-providers';
import type { ConsumedOAuthState, NewOAuthState, OAuthAccountInput, RemovedOAuthAccount, StoredOAuthCredential } from '../src/server/integrations/oauth-repository';
import { decryptOAuthSecret, decryptOAuthTokens, encryptOAuthSecret, encryptOAuthTokens, type OAuthTokenSet } from '../src/server/integrations/oauth-token-vault';

const ownerId = 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0020';
const integrationId = 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0040';
const credentialId = 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0050';
const sessionHash = 'a'.repeat(64);
const key = Buffer.alloc(32, 23).toString('base64');
const fixedTime = new Date('2026-10-11T15:00:00.000Z');
const env = {
  NODE_ENV: 'test',
  OAUTH_REDIRECT_BASE_URL: 'https://flowpilot.test',
  CREDENTIAL_ENCRYPTION_KEY: key,
  GMAIL_OAUTH_CLIENT_ID: 'gmail-client-id',
  GMAIL_OAUTH_CLIENT_SECRET: 'gmail-private-client-secret',
};
const actor: OAuthActor = { ownerId, sessionTokenHash: sessionHash };

class FakeOAuthRepository implements OAuthRepository {
  states = new Map<string, NewOAuthState>();
  activeSession = true;
  account: ConnectedIntegration | null = null;
  credential: StoredOAuthCredential | null = null;
  removed: RemovedOAuthAccount | null = null;
  compareAndSwapResult = true;
  reauthRequired = false;

  async createState(record: NewOAuthState): Promise<boolean> {
    this.states.set(record.stateHash, record);
    return true;
  }

  async consumeState(stateHash: string, provider: OAuthProviderId, browserBindingHash: string, now: Date): Promise<ConsumedOAuthState | null> {
    const row = this.states.get(stateHash);
    if (!row || row.provider !== provider || row.browserBindingHash !== browserBindingHash || row.expiresAt <= now) return null;
    this.states.delete(stateHash);
    return { ...row, createdAt: fixedTime };
  }

  async isSessionActive(candidateOwner: string, tokenHash: string): Promise<boolean> {
    return this.activeSession && candidateOwner === ownerId && tokenHash === sessionHash;
  }

  async listAccounts(): Promise<ConnectedIntegration[]> {
    return this.account ? [this.account] : [];
  }

  async saveAccount(input: OAuthAccountInput): Promise<ConnectedIntegration> {
    this.account = {
      id: integrationId,
      provider: input.provider,
      name: input.displayName,
      status: 'connected',
      scopes: input.tokens.scopes,
      accessTokenExpiresAt: input.tokens.accessTokenExpiresAt === null ? null : new Date(input.tokens.accessTokenExpiresAt).toISOString(),
      updatedAt: input.now.toISOString(),
    };
    return this.account;
  }

  async getCredential(candidateOwner: string, provider: OAuthProviderId, candidateIntegration: string): Promise<StoredOAuthCredential | null> {
    if (!this.credential || candidateOwner !== this.credential.ownerId || provider !== this.credential.provider || candidateIntegration !== this.credential.integrationId) return null;
    return this.credential;
  }

  async compareAndSwapTokens(record: StoredOAuthCredential, encryptedPayload: string): Promise<boolean> {
    if (!this.compareAndSwapResult || !this.credential || this.credential.encryptedPayload !== record.encryptedPayload) return false;
    this.credential = { ...this.credential, encryptedPayload };
    return true;
  }

  async markReauthRequired(): Promise<void> {
    this.reauthRequired = true;
    if (this.credential) this.credential = { ...this.credential, status: 'reauth_required' };
    if (this.account) this.account = { ...this.account, status: 'reauth_required' };
  }

  async removeAccount(candidateOwner: string, provider: OAuthProviderId, candidateIntegration: string): Promise<RemovedOAuthAccount | null> {
    if (!this.removed || candidateOwner !== this.removed.ownerId || provider !== this.removed.provider || candidateIntegration !== this.removed.id) return null;
    const result = this.removed;
    this.removed = null;
    return result;
  }
}

function makeService(repository: FakeOAuthRepository, fetchImpl: typeof fetch = fetch, customEnv: OAuthEnvironment = env, overrides: Partial<OAuthServiceDependencies> = {}) {
  let randomIndex = 0;
  let idIndex = 0;
  return createOAuthService({
    repository,
    authenticate: async () => actor,
    env: customEnv,
    fetch: fetchImpl,
    now: () => fixedTime,
    random: () => Buffer.alloc(32, ++randomIndex).toString('base64url'),
    createId: () => `c18b6c07-750c-4be1-a1e0-8b1a5f2e${String(++idIndex).padStart(4, '0')}`,
    encryptSecret: (secret, context) => encryptOAuthSecret(secret, context, key),
    decryptSecret: (envelope, context) => decryptOAuthSecret(envelope, context, key),
    encryptTokens: (tokens, context) => encryptOAuthTokens(tokens, context, key),
    decryptTokens: (envelope, context) => decryptOAuthTokens(envelope, context, key),
    ...overrides,
  });
}

async function beginGmail(service: ReturnType<typeof makeService>) {
  const response = await service.start(new Request('https://flowpilot.test/api/integrations/gmail/connect', {
    method: 'POST',
    headers: { origin: 'https://flowpilot.test' },
  }), 'gmail');
  const payload = await response.json() as { authorizationUrl: string };
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie);
  const pair = cookie.split(';', 1)[0];
  return { response, url: new URL(payload.authorizationUrl), cookiePair: pair };
}

function tokenResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    access_token: 'access-token-example-0123456789',
    refresh_token: 'refresh-token-example-0123456789',
    expires_in: 3600,
    token_type: 'Bearer',
    scope: 'openid email https://www.googleapis.com/auth/gmail.send',
    ...overrides,
  });
}

test('OAuth connect creates one-time session-bound state, S256 PKCE, and an HttpOnly callback-only browser cookie', async () => {
  const repository = new FakeOAuthRepository();
  const service = makeService(repository);
  const { response, url, cookiePair } = await beginGmail(service);
  assert.equal(response.status, 200);
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.pathname, '/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), 'gmail-client-id');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://flowpilot.test/api/integrations/oauth/gmail/callback');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.has('client_secret'), false);
  const rawState = url.searchParams.get('state');
  assert.ok(rawState);
  const state = [...repository.states.values()][0];
  assert.equal(state.stateHash.length, 64);
  assert.notEqual(state.stateHash, rawState);
  assert.equal(state.sessionTokenHash, sessionHash);
  assert.equal(state.expiresAt.getTime() - fixedTime.getTime(), 10 * 60 * 1000);
  assert.equal(state.encryptedCodeVerifier.includes(rawState ?? ''), false);
  assert.match(cookiePair, /^fp_oauth_gmail_[a-f0-9]{64}=/);
  assert.match(response.headers.get('set-cookie') ?? '', /HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
  assert.match(response.headers.get('set-cookie') ?? '', /Path=\/api\/integrations\/oauth\/gmail\/callback/);
  assert.equal(response.headers.get('set-cookie')?.includes('fp_session='), false);
});

test('OAuth callback exchanges the code with its S256 verifier, stores account metadata, clears binding cookie, and does not leak tokens', async () => {
  const repository = new FakeOAuthRepository();
  let capturedVerifier = '';
  const service = makeService(repository, async (input, init) => {
    const target = String(input);
    if (target === 'https://oauth2.googleapis.com/token') {
      const form = init?.body as URLSearchParams;
      capturedVerifier = form.get('code_verifier') ?? '';
      assert.equal(form.get('client_secret'), 'gmail-private-client-secret');
      return tokenResponse();
    }
    assert.equal(target, 'https://openidconnect.googleapis.com/v1/userinfo');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer access-token-example-0123456789');
    return Response.json({ sub: 'google-subject-123', email: 'pilot@example.com' });
  });
  const { url, cookiePair } = await beginGmail(service);
  const challenge = url.searchParams.get('code_challenge');
  const state = url.searchParams.get('state');
  assert.ok(challenge && state);
  const callback = new Request(`https://flowpilot.test/api/integrations/oauth/gmail/callback?code=one-time-code&state=${state}`, { headers: { cookie: cookiePair } });
  const response = await service.callback(callback, 'gmail');
  assert.equal(response.status, 303);
  const location = new URL(response.headers.get('location') ?? '');
  assert.equal(location.pathname, '/integrations');
  assert.equal(location.searchParams.get('oauth'), 'connected');
  assert.equal(location.searchParams.get('provider'), 'gmail');
  assert.equal(location.search.includes('one-time-code'), false);
  assert.equal(location.search.includes(state), false);
  assert.equal(response.headers.get('set-cookie')?.includes('Max-Age=0'), true);
  assert.equal(repository.states.size, 0);
  assert.equal(repository.account?.name, 'pilot@example.com');
  assert.equal(repository.account?.status, 'connected');
  assert.equal(capturedVerifier.length, 43);
  assert.equal(createHash('sha256').update(capturedVerifier).digest('base64url'), challenge);
  assert.equal((await response.text()).includes('access-token-example'), false);
  const listed = await service.list(new Request('https://flowpilot.test/api/integrations'));
  const json = await listed.text();
  assert.equal(json.includes('access-token-example'), false);
  assert.equal(json.includes('gmail-private-client-secret'), false);
});

test('consumed authorization state cannot be replayed and a changed/revoked initiating session cannot complete the grant', async () => {
  const repository = new FakeOAuthRepository();
  let tokenCalls = 0;
  const service = makeService(repository, async (input) => {
    if (String(input) === 'https://oauth2.googleapis.com/token') tokenCalls += 1;
    return tokenResponse();
  });
  const flow = await beginGmail(service);
  const state = flow.url.searchParams.get('state');
  const request = new Request(`https://flowpilot.test/api/integrations/oauth/gmail/callback?code=one-time-code&state=${state}`, { headers: { cookie: flow.cookiePair } });
  const first = await service.callback(request, 'gmail');
  assert.equal(first.status, 303);
  const replay = await service.callback(request, 'gmail');
  assert.equal(replay.status, 400);
  assert.equal(tokenCalls, 1);

  const secondRepository = new FakeOAuthRepository();
  secondRepository.activeSession = false;
  const secondService = makeService(secondRepository, async () => { tokenCalls += 1; return tokenResponse(); });
  const secondFlow = await beginGmail(secondService);
  const secondState = secondFlow.url.searchParams.get('state');
  const expired = await secondService.callback(new Request(`https://flowpilot.test/api/integrations/oauth/gmail/callback?code=code&state=${secondState}`, { headers: { cookie: secondFlow.cookiePair } }), 'gmail');
  assert.equal(new URL(expired.headers.get('location') ?? '').searchParams.get('oauth'), 'expired');
  assert.equal(tokenCalls, 1);
});

test('provider errors are opaque, cross-origin connect attempts are rejected, and missing provider configuration stays disabled', async () => {
  const repository = new FakeOAuthRepository();
  const service = makeService(repository);
  const crossOrigin = await service.start(new Request('https://flowpilot.test/api/integrations/gmail/connect', { method: 'POST', headers: { origin: 'https://attacker.test' } }), 'gmail');
  assert.equal(crossOrigin.status, 403);
  const missingConfig = await service.start(new Request('https://flowpilot.test/api/integrations/slack/connect', { method: 'POST', headers: { origin: 'https://flowpilot.test' } }), 'slack');
  assert.equal(missingConfig.status, 503);
  const flow = await beginGmail(service);
  const state = flow.url.searchParams.get('state');
  const response = await service.callback(new Request(`https://flowpilot.test/api/integrations/oauth/gmail/callback?error=access_denied&error_description=provider-secret&state=${state}`, { headers: { cookie: flow.cookiePair } }), 'gmail');
  const location = response.headers.get('location') ?? '';
  assert.equal(new URL(location).searchParams.get('oauth'), 'denied');
  assert.equal(location.includes('provider-secret'), false);
  assert.equal(repository.account, null);
});

test('OAuth readiness requires a valid server token-vault key and reports no secrets', () => {
  const configured = getOAuthProviderStatuses(env);
  assert.equal(configured.find((provider) => provider.id === 'gmail')?.configured, true);
  const missingKey = getOAuthProviderStatuses({ ...env, CREDENTIAL_ENCRYPTION_KEY: 'invalid' });
  assert.equal(missingKey.find((provider) => provider.id === 'gmail')?.configured, false);
  assert.match(missingKey.find((provider) => provider.id === 'gmail')?.setupHint ?? '', /CREDENTIAL_ENCRYPTION_KEY/);
  assert.equal(JSON.stringify(configured).includes('gmail-private-client-secret'), false);
});

test('Slack PKCE stays off unless its irreversible app setting is explicitly enabled', async () => {
  const slackEnv = {
    NODE_ENV: 'test', OAUTH_REDIRECT_BASE_URL: 'https://flowpilot.test',
    SLACK_OAUTH_CLIENT_ID: 'slack-client-id', SLACK_OAUTH_CLIENT_SECRET: 'slack-private-secret',
  };
  const repo = new FakeOAuthRepository();
  const noPkce = makeService(repo, fetch, slackEnv);
  const response = await noPkce.start(new Request('https://flowpilot.test/api/integrations/slack/connect', { method: 'POST', headers: { origin: 'https://flowpilot.test' } }), 'slack');
  const url = new URL((await response.json() as { authorizationUrl: string }).authorizationUrl);
  assert.equal(url.origin, 'https://slack.com');
  assert.equal(url.pathname, '/oauth/v2/authorize');
  assert.equal(url.searchParams.get('scope'), 'channels:read,chat:write');
  assert.equal(url.searchParams.has('code_challenge'), false);
  assert.equal(url.searchParams.has('client_secret'), false);

  const pkceRepo = new FakeOAuthRepository();
  const withPkce = makeService(pkceRepo, fetch, { ...slackEnv, SLACK_OAUTH_PKCE_ENABLED: 'true' });
  const pkceResponse = await withPkce.start(new Request('https://flowpilot.test/api/integrations/slack/connect', { method: 'POST', headers: { origin: 'https://flowpilot.test' } }), 'slack');
  const pkceUrl = new URL((await pkceResponse.json() as { authorizationUrl: string }).authorizationUrl);
  assert.equal(pkceUrl.searchParams.get('code_challenge_method'), 'S256');
});

test('Airtable uses its fixed endpoint, S256 verifier, exact scopes, and optional secret configuration', async () => {
  const airtableEnv = {
    NODE_ENV: 'test', OAUTH_REDIRECT_BASE_URL: 'https://flowpilot.test', AIRTABLE_OAUTH_CLIENT_ID: 'airtable-client-id',
  };
  const repository = new FakeOAuthRepository();
  let sentVerifier = '';
  const service = makeService(repository, async (input, init) => {
    assert.equal(String(input), 'https://airtable.com/oauth2/v1/token');
    const form = init?.body as URLSearchParams;
    sentVerifier = form.get('code_verifier') ?? '';
    assert.equal(form.get('client_id'), 'airtable-client-id');
    return Response.json({ access_token: 'airtable-access-token', refresh_token: 'airtable-refresh-token', expires_in: 3600, refresh_expires_in: 86400, token_type: 'Bearer', scope: 'data.records:read data.records:write schema.bases:read' });
  }, airtableEnv);
  const start = await service.start(new Request('https://flowpilot.test/api/integrations/airtable/connect', { method: 'POST', headers: { origin: 'https://flowpilot.test' } }), 'airtable');
  const payload = await start.json() as { authorizationUrl: string };
  const url = new URL(payload.authorizationUrl);
  assert.equal(url.origin, 'https://airtable.com');
  assert.equal(url.pathname, '/oauth2/v1/authorize');
  assert.equal(url.searchParams.get('scope'), 'data.records:read data.records:write schema.bases:read');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const state = url.searchParams.get('state');
  const cookie = start.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(cookie);
  const callback = await service.callback(new Request(`https://flowpilot.test/api/integrations/oauth/airtable/callback?code=airtable-code&state=${state}&code_challenge=${url.searchParams.get('code_challenge')}&code_challenge_method=S256`, { headers: { cookie } }), 'airtable');
  assert.equal(callback.status, 303);
  assert.equal(sentVerifier.length, 43);
  assert.equal(repository.account?.provider, 'airtable');

  const noEchoRepository = new FakeOAuthRepository();
  let noEchoTokenRequests = 0;
  const noEchoService = makeService(noEchoRepository, async () => { noEchoTokenRequests += 1; return Response.json({}); }, airtableEnv);
  const noEchoStart = await noEchoService.start(new Request('https://flowpilot.test/api/integrations/airtable/connect', { method: 'POST', headers: { origin: 'https://flowpilot.test' } }), 'airtable');
  const noEchoUrl = new URL(((await noEchoStart.json()) as { authorizationUrl: string }).authorizationUrl);
  const noEchoCookie = noEchoStart.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(noEchoCookie);
  const missingEcho = await noEchoService.callback(new Request(`https://flowpilot.test/api/integrations/oauth/airtable/callback?code=airtable-code&state=${noEchoUrl.searchParams.get('state')}`, { headers: { cookie: noEchoCookie } }), 'airtable');
  assert.equal(new URL(missingEcho.headers.get('location') ?? '').searchParams.get('oauth'), 'failed');
  assert.equal(noEchoTokenRequests, 0);
  assert.equal(noEchoRepository.account, null);
});

test('Airtable confidential-client authentication follows its documented Base64URL credential format', async () => {
  const clientId = 'airtable-client-id';
  const clientSecret = 'airtable-private-secret';
  const airtableEnv = { NODE_ENV: 'test', OAUTH_REDIRECT_BASE_URL: 'https://flowpilot.test', AIRTABLE_OAUTH_CLIENT_ID: clientId, AIRTABLE_OAUTH_CLIENT_SECRET: clientSecret };
  const repository = new FakeOAuthRepository();
  let authorization = '';
  const service = makeService(repository, async (_input, init) => {
    const headers = new Headers(init?.headers);
    authorization = headers.get('authorization') ?? '';
    const form = init?.body as URLSearchParams;
    assert.equal(form.get('client_id'), null);
    assert.ok(form.get('code_verifier'));
    return Response.json({ access_token: 'airtable-confidential-access-token', refresh_token: 'airtable-confidential-refresh-token', expires_in: 3600, token_type: 'Bearer', scope: 'data.records:read data.records:write schema.bases:read' });
  }, airtableEnv);
  const start = await service.start(new Request('https://flowpilot.test/api/integrations/airtable/connect', { method: 'POST', headers: { origin: 'https://flowpilot.test' } }), 'airtable');
  const url = new URL(((await start.json()) as { authorizationUrl: string }).authorizationUrl);
  const cookie = start.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(cookie);
  const callback = await service.callback(new Request(`https://flowpilot.test/api/integrations/oauth/airtable/callback?code=airtable-code&state=${url.searchParams.get('state')}&code_challenge=${url.searchParams.get('code_challenge')}&code_challenge_method=S256`, { headers: { cookie } }), 'airtable');
  assert.equal(callback.status, 303);
  assert.equal(authorization, `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64url')}`);
});

test('expired OAuth access tokens refresh server-side, preserve omitted refresh tokens, and atomically replace ciphertext', async () => {
  const repository = new FakeOAuthRepository();
  const oldTokens: OAuthTokenSet = {
    accessToken: 'expired-access-token-0123456789', refreshToken: 'stable-refresh-token-0123456789',
    accessTokenExpiresAt: fixedTime.getTime() - 1000, refreshTokenExpiresAt: fixedTime.getTime() + 86_400_000, tokenType: 'Bearer', scopes: ['openid', 'email'],
  };
  const encrypted = encryptOAuthTokens(oldTokens, { ownerId, resourceId: `${integrationId}:${credentialId}`, provider: 'gmail' }, key);
  repository.credential = { integrationId, credentialId, ownerId, provider: 'gmail', name: 'pilot@example.com', status: 'connected', settings: {}, encryptedPayload: encrypted };
  const service = makeService(repository, async (input, init) => {
    assert.equal(String(input), 'https://oauth2.googleapis.com/token');
    const form = init?.body as URLSearchParams;
    assert.equal(form.get('grant_type'), 'refresh_token');
    assert.equal(form.get('refresh_token'), oldTokens.refreshToken);
    return tokenResponse({ access_token: 'fresh-access-token-0123456789', refresh_token: undefined, expires_in: 3600 });
  });
  const token = await service.getValidAccessToken(ownerId, 'gmail', integrationId);
  assert.equal(token, 'fresh-access-token-0123456789');
  assert.ok(repository.credential?.encryptedPayload !== encrypted);
  const stored = decryptOAuthTokens(repository.credential?.encryptedPayload ?? '', { ownerId, resourceId: `${integrationId}:${credentialId}`, provider: 'gmail' }, key);
  assert.equal(stored.refreshToken, oldTokens.refreshToken);
  assert.equal(stored.refreshTokenExpiresAt, oldTokens.refreshTokenExpiresAt);
  assert.ok((stored.accessTokenExpiresAt ?? 0) > fixedTime.getTime());
});

test('permanent refresh-token rejection marks reauthorization while a transient provider outage does not', async () => {
  const tokens: OAuthTokenSet = { accessToken: 'expired-access-token-0123456789', refreshToken: 'refresh-token-for-test-0123456789', accessTokenExpiresAt: fixedTime.getTime() - 1, refreshTokenExpiresAt: fixedTime.getTime() + 86_400_000, tokenType: 'Bearer', scopes: ['openid', 'email'] };
  const makeCredential = (): StoredOAuthCredential => ({
    integrationId, credentialId, ownerId, provider: 'gmail', name: 'pilot@example.com', status: 'connected', settings: {},
    encryptedPayload: encryptOAuthTokens(tokens, { ownerId, resourceId: `${integrationId}:${credentialId}`, provider: 'gmail' }, key),
  });

  const rejectedRepository = new FakeOAuthRepository();
  rejectedRepository.credential = makeCredential();
  const rejectedService = makeService(rejectedRepository, async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
  await assert.rejects(rejectedService.getValidAccessToken(ownerId, 'gmail', integrationId), OAuthOperationError);
  assert.equal(rejectedRepository.reauthRequired, true);
  assert.equal(rejectedRepository.credential?.status, 'reauth_required');

  const transientRepository = new FakeOAuthRepository();
  transientRepository.credential = makeCredential();
  const transientService = makeService(transientRepository, async () => Response.json({ error: 'temporarily_unavailable' }, { status: 503 }));
  await assert.rejects(transientService.getValidAccessToken(ownerId, 'gmail', integrationId), OAuthOperationError);
  assert.equal(transientRepository.reauthRequired, false);
  assert.equal(transientRepository.credential?.status, 'connected');
});

test('expired access token without a usable refresh token is marked for reauthorization', async () => {
  const repository = new FakeOAuthRepository();
  const tokens: OAuthTokenSet = { accessToken: 'expired-access-token-0123456789', refreshToken: null, accessTokenExpiresAt: fixedTime.getTime() - 1, refreshTokenExpiresAt: null, tokenType: 'Bearer', scopes: [] };
  repository.credential = {
    integrationId, credentialId, ownerId, provider: 'gmail', name: 'pilot@example.com', status: 'connected', settings: {},
    encryptedPayload: encryptOAuthTokens(tokens, { ownerId, resourceId: `${integrationId}:${credentialId}`, provider: 'gmail' }, key),
  };
  const service = makeService(repository);
  await assert.rejects(service.getValidAccessToken(ownerId, 'gmail', integrationId), OAuthOperationError);
  assert.equal(repository.reauthRequired, true);
});

test('disconnect removes local tokens before reporting provider-revocation status and stays owner-scoped', async () => {
  const repository = new FakeOAuthRepository();
  const tokens: OAuthTokenSet = { accessToken: 'slack-access-token-0123456789', refreshToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null, tokenType: 'Bearer', scopes: ['chat:write'] };
  const ciphertext = encryptOAuthTokens(tokens, { ownerId, resourceId: `${integrationId}:${credentialId}`, provider: 'slack' }, key);
  repository.removed = { id: integrationId, ownerId, provider: 'slack', name: 'FlowPilot workspace', credentialId, encryptedPayload: ciphertext };
  const slackEnv = { NODE_ENV: 'test', OAUTH_REDIRECT_BASE_URL: 'https://flowpilot.test', SLACK_OAUTH_CLIENT_ID: 'slack-client-id', SLACK_OAUTH_CLIENT_SECRET: 'slack-client-secret' };
  const calls: string[] = [];
  const service = makeService(repository, async (input) => {
    calls.push(String(input));
    return Response.json({ ok: true, revoked: true });
  }, slackEnv);
  const wrongOwnerService = makeService(repository, fetch, slackEnv, { authenticate: async () => ({ ownerId: 'c18b6c07-750c-4be1-a1e0-8b1a5f2e0099', sessionTokenHash: sessionHash }) });
  const wrongOwner = await wrongOwnerService.disconnect(new Request('https://flowpilot.test/api/integrations/slack', { method: 'DELETE', headers: { origin: 'https://flowpilot.test' } }), 'slack', integrationId);
  assert.equal(wrongOwner.status, 404);
  repository.removed = { id: integrationId, ownerId, provider: 'slack', name: 'FlowPilot workspace', credentialId, encryptedPayload: ciphertext };
  const response = await service.disconnect(new Request('https://flowpilot.test/api/integrations/slack', { method: 'DELETE', headers: { origin: 'https://flowpilot.test' } }), 'slack', integrationId);
  const result = await response.json() as { ok: boolean; remoteRevocation: string };
  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.equal(result.remoteRevocation, 'confirmed');
  assert.deepEqual(calls, ['https://slack.com/api/auth.revoke']);
});
