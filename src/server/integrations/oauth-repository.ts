import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../../db';
import { credentials, integrations, oauthStates, sessions } from '../../db/schema';
import { OAUTH_PROVIDER_IDS, type ConnectedIntegration, type OAuthProviderId } from '../../types/integrations';
import { encryptOAuthTokens, type OAuthTokenSet } from './oauth-token-vault';

export interface NewOAuthState {
  id: string;
  ownerId: string;
  provider: OAuthProviderId;
  stateHash: string;
  sessionTokenHash: string;
  browserBindingHash: string;
  encryptedCodeVerifier: string;
  redirectUri: string;
  expiresAt: Date;
}

export interface ConsumedOAuthState extends NewOAuthState {
  createdAt: Date;
}

export interface OAuthAccountInput {
  ownerId: string;
  provider: OAuthProviderId;
  displayName: string;
  providerAccountId: string | null;
  tokens: OAuthTokenSet;
  now: Date;
}

export interface StoredOAuthCredential {
  integrationId: string;
  credentialId: string;
  ownerId: string;
  provider: OAuthProviderId;
  name: string;
  status: string;
  settings: Record<string, unknown>;
  encryptedPayload: string;
}

export interface RemovedOAuthAccount {
  id: string;
  ownerId: string;
  provider: OAuthProviderId;
  name: string;
  encryptedPayload: string | null;
  credentialId: string | null;
}

function safeSettings(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function accountSummary(record: {
  id: string;
  provider: string;
  name: string;
  status: string;
  settings: unknown;
  updatedAt: Date;
}): ConnectedIntegration | null {
  if (!OAUTH_PROVIDER_IDS.includes(record.provider as OAuthProviderId)) return null;
  const settings = safeSettings(record.settings);
  const scopes = Array.isArray(settings.scopes) ? settings.scopes.filter((scope): scope is string => typeof scope === 'string') : [];
  const expires = typeof settings.accessTokenExpiresAt === 'string' ? settings.accessTokenExpiresAt : null;
  const statuses = ['connected', 'reauth_required', 'pending', 'disconnected'] as const;
  const status = statuses.includes(record.status as (typeof statuses)[number]) ? record.status as (typeof statuses)[number] : 'reauth_required';
  return {
    id: record.id,
    provider: record.provider as OAuthProviderId,
    name: record.name,
    status,
    scopes,
    accessTokenExpiresAt: expires,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export const oauthRepository = {
  async createState(record: NewOAuthState, now: Date): Promise<boolean> {
    const expiredBefore = new Date(now.getTime() - 60_000);
    await db.execute(sql`
      delete from ${oauthStates}
      where ${oauthStates.id} in (
        select ${oauthStates.id} from ${oauthStates}
        where ${oauthStates.expiresAt} < ${expiredBefore}
        order by ${oauthStates.expiresAt}
        limit 100
      )
    `);
    const inserted = await db.execute<{ id: string }>(sql`
      insert into ${oauthStates} (
        id, owner_id, provider, state_hash, session_token_hash, browser_binding_hash,
        encrypted_code_verifier, redirect_uri, expires_at
      )
      select ${record.id}, ${record.ownerId}, ${record.provider}, ${record.stateHash},
        ${record.sessionTokenHash}, ${record.browserBindingHash}, ${record.encryptedCodeVerifier},
        ${record.redirectUri}, ${record.expiresAt}
      where (
        select count(*) from ${oauthStates}
        where ${oauthStates.ownerId} = ${record.ownerId} and ${oauthStates.expiresAt} > ${now}
      ) < 5
      returning id
    `);
    return inserted.rows.length === 1;
  },

  async consumeState(
    stateHash: string,
    provider: OAuthProviderId,
    browserBindingHash: string,
    now: Date,
  ): Promise<ConsumedOAuthState | null> {
    const [row] = await db.delete(oauthStates)
      .where(and(
        eq(oauthStates.stateHash, stateHash),
        eq(oauthStates.provider, provider),
        eq(oauthStates.browserBindingHash, browserBindingHash),
        gt(oauthStates.expiresAt, now),
      ))
      .returning({
        id: oauthStates.id,
        ownerId: oauthStates.ownerId,
        provider: oauthStates.provider,
        stateHash: oauthStates.stateHash,
        sessionTokenHash: oauthStates.sessionTokenHash,
        browserBindingHash: oauthStates.browserBindingHash,
        encryptedCodeVerifier: oauthStates.encryptedCodeVerifier,
        redirectUri: oauthStates.redirectUri,
        expiresAt: oauthStates.expiresAt,
        createdAt: oauthStates.createdAt,
      });
    return row ? { ...row, provider: row.provider as OAuthProviderId } : null;
  },

  async isSessionActive(ownerId: string, tokenHash: string, now: Date): Promise<boolean> {
    const [active] = await db.select({ id: sessions.id })
      .from(sessions)
      .where(and(
        eq(sessions.userId, ownerId),
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ))
      .limit(1);
    return Boolean(active);
  },

  async listAccounts(ownerId: string): Promise<ConnectedIntegration[]> {
    const rows = await db.select({
      id: integrations.id,
      provider: integrations.provider,
      name: integrations.name,
      status: integrations.status,
      settings: integrations.settings,
      updatedAt: integrations.updatedAt,
    })
      .from(integrations)
      .where(and(eq(integrations.ownerId, ownerId), inArray(integrations.provider, OAUTH_PROVIDER_IDS)))
      .orderBy(integrations.provider, integrations.name);
    return rows.map(accountSummary).filter((item): item is ConnectedIntegration => item !== null);
  },

  async saveAccount(input: OAuthAccountInput): Promise<ConnectedIntegration> {
    const displayName = input.displayName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120) || 'Connected account';
    const nowIso = input.now.toISOString();
    const settings = {
      providerAccountId: input.providerAccountId?.slice(0, 256) ?? null,
      scopes: input.tokens.scopes,
      accessTokenExpiresAt: input.tokens.accessTokenExpiresAt === null ? null : new Date(input.tokens.accessTokenExpiresAt).toISOString(),
      refreshTokenExpiresAt: input.tokens.refreshTokenExpiresAt === null ? null : new Date(input.tokens.refreshTokenExpiresAt).toISOString(),
      tokenType: input.tokens.tokenType,
    };

    const [account] = await db.insert(integrations).values({
      ownerId: input.ownerId,
      provider: input.provider,
      name: displayName,
      status: 'pending',
      settings,
      updatedAt: input.now,
    }).onConflictDoUpdate({
      target: [integrations.ownerId, integrations.provider, integrations.name],
      set: { status: 'pending', settings, updatedAt: input.now },
    }).returning({ id: integrations.id, ownerId: integrations.ownerId, provider: integrations.provider, name: integrations.name });

    const credentialId = randomUUID();
    const encryptedPayload = encryptOAuthTokens(input.tokens, {
      ownerId: input.ownerId,
      resourceId: `${account.id}:${credentialId}`,
      provider: input.provider,
    });
    await db.insert(credentials).values({
      id: credentialId,
      ownerId: input.ownerId,
      integrationId: account.id,
      provider: input.provider,
      name: 'OAuth access and refresh tokens',
      encryptedPayload,
      updatedAt: input.now,
    }).onConflictDoUpdate({
      target: credentials.integrationId,
      set: {
        id: credentialId,
        ownerId: input.ownerId,
        provider: input.provider,
        name: 'OAuth access and refresh tokens',
        encryptedPayload,
        updatedAt: input.now,
      },
    });

    await db.update(integrations).set({ status: 'connected', settings, updatedAt: input.now })
      .where(and(eq(integrations.id, account.id), eq(integrations.ownerId, input.ownerId), eq(integrations.provider, input.provider)));

    return {
      id: account.id,
      provider: account.provider as OAuthProviderId,
      name: account.name,
      status: 'connected',
      scopes: settings.scopes,
      accessTokenExpiresAt: settings.accessTokenExpiresAt,
      updatedAt: nowIso,
    };
  },

  async getCredential(ownerId: string, provider: OAuthProviderId, integrationId: string): Promise<StoredOAuthCredential | null> {
    const [row] = await db.select({
      integrationId: integrations.id,
      credentialId: credentials.id,
      ownerId: integrations.ownerId,
      provider: integrations.provider,
      name: integrations.name,
      status: integrations.status,
      settings: integrations.settings,
      encryptedPayload: credentials.encryptedPayload,
    })
      .from(integrations)
      .innerJoin(credentials, and(eq(credentials.integrationId, integrations.id), eq(credentials.ownerId, integrations.ownerId)))
      .where(and(eq(integrations.id, integrationId), eq(integrations.ownerId, ownerId), eq(integrations.provider, provider), eq(credentials.provider, provider)))
      .limit(1);
    if (!row) return null;
    return { ...row, provider: row.provider as OAuthProviderId, settings: safeSettings(row.settings) };
  },

  async compareAndSwapTokens(record: StoredOAuthCredential, encryptedPayload: string, tokens: OAuthTokenSet, now: Date): Promise<boolean> {
    const [updated] = await db.update(credentials).set({ encryptedPayload, updatedAt: now })
      .where(and(
        eq(credentials.id, record.credentialId),
        eq(credentials.ownerId, record.ownerId),
        eq(credentials.integrationId, record.integrationId),
        eq(credentials.encryptedPayload, record.encryptedPayload),
      ))
      .returning({ id: credentials.id });
    if (!updated) return false;
    await db.update(integrations).set({
      status: 'connected',
      settings: {
        ...record.settings,
        scopes: tokens.scopes,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt === null ? null : new Date(tokens.accessTokenExpiresAt).toISOString(),
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt === null ? null : new Date(tokens.refreshTokenExpiresAt).toISOString(),
        tokenType: tokens.tokenType,
      },
      updatedAt: now,
    }).where(and(eq(integrations.id, record.integrationId), eq(integrations.ownerId, record.ownerId), eq(integrations.provider, record.provider)));
    return true;
  },

  async markReauthRequired(ownerId: string, provider: OAuthProviderId, integrationId: string, now: Date): Promise<void> {
    await db.update(integrations).set({ status: 'reauth_required', updatedAt: now })
      .where(and(eq(integrations.id, integrationId), eq(integrations.ownerId, ownerId), eq(integrations.provider, provider)));
  },

  async removeAccount(ownerId: string, provider: OAuthProviderId, integrationId: string): Promise<RemovedOAuthAccount | null> {
    const credential = await this.getCredential(ownerId, provider, integrationId);
    const [deleted] = await db.delete(integrations).where(and(
      eq(integrations.id, integrationId),
      eq(integrations.ownerId, ownerId),
      eq(integrations.provider, provider),
    )).returning({ id: integrations.id, ownerId: integrations.ownerId, provider: integrations.provider, name: integrations.name });
    if (!deleted) return null;
    return {
      ...deleted,
      provider: deleted.provider as OAuthProviderId,
      encryptedPayload: credential?.encryptedPayload ?? null,
      credentialId: credential?.credentialId ?? null,
    };
  },
};
