import { OAUTH_PROVIDER_IDS, type OAuthProviderId, type OAuthProviderStatus } from '../../types/integrations';

export interface OAuthProviderDefinition {
  id: OAuthProviderId;
  label: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint: string | null;
  scopes: readonly string[];
  pkce: 'required' | 'optional' | 'disabled';
  tokenAuth: 'body' | 'basic-if-secret';
  supportsOfflineAccess: boolean;
  scopeDelimiter: ' ' | ',';
  setupHint: string;
}

export interface OAuthProviderConfig extends OAuthProviderDefinition {
  clientId: string;
  clientSecret: string | null;
  redirectBaseUrl: string;
  redirectUri: string;
  pkceEnabled: boolean;
}

export type OAuthEnvironment = Record<string, string | undefined>;

const definitions: Record<OAuthProviderId, OAuthProviderDefinition> = {
  gmail: {
    id: 'gmail',
    label: 'Gmail',
    clientIdEnv: 'GMAIL_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GMAIL_OAUTH_CLIENT_SECRET',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
    scopes: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'],
    pkce: 'required',
    tokenAuth: 'body',
    supportsOfflineAccess: true,
    scopeDelimiter: ' ',
    setupHint: 'Register a Google OAuth Web application and add the exact FlowPilot callback URL as an Authorized redirect URI.',
  },
  slack: {
    id: 'slack',
    label: 'Slack',
    clientIdEnv: 'SLACK_OAUTH_CLIENT_ID',
    clientSecretEnv: 'SLACK_OAUTH_CLIENT_SECRET',
    authorizationEndpoint: 'https://slack.com/oauth/v2/authorize',
    tokenEndpoint: 'https://slack.com/api/oauth.v2.access',
    revocationEndpoint: 'https://slack.com/api/auth.revoke',
    scopes: ['channels:read', 'chat:write'],
    // Slack PKCE is an optional, one-way app setting that changes the client to a public client.
    // Keep it off by default; state, browser binding, and the confidential client secret remain active.
    pkce: 'optional',
    tokenAuth: 'body',
    supportsOfflineAccess: false,
    scopeDelimiter: ',',
    setupHint: 'Create a Slack app, add the exact FlowPilot Redirect URL, and add channels:read and chat:write bot scopes.',
  },
  airtable: {
    id: 'airtable',
    label: 'Airtable',
    clientIdEnv: 'AIRTABLE_OAUTH_CLIENT_ID',
    clientSecretEnv: 'AIRTABLE_OAUTH_CLIENT_SECRET',
    authorizationEndpoint: 'https://airtable.com/oauth2/v1/authorize',
    tokenEndpoint: 'https://airtable.com/oauth2/v1/token',
    revocationEndpoint: null,
    scopes: ['data.records:read', 'data.records:write', 'schema.bases:read'],
    pkce: 'required',
    tokenAuth: 'basic-if-secret',
    supportsOfflineAccess: false,
    scopeDelimiter: ' ',
    setupHint: 'Register an Airtable OAuth integration, enable the listed scopes, and register the exact FlowPilot redirect URI.',
  },
};

export function oauthProviderIds(): readonly OAuthProviderId[] {
  return OAUTH_PROVIDER_IDS;
}

export function getOAuthProviderDefinition(id: string): OAuthProviderDefinition | null {
  return OAUTH_PROVIDER_IDS.includes(id as OAuthProviderId) ? definitions[id as OAuthProviderId] : null;
}

function redirectBaseUrl(env: OAuthEnvironment): string | null {
  const raw = env.OAUTH_REDIRECT_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const localHttp = env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !localHttp)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getOAuthProviderConfig(id: string, env: OAuthEnvironment = process.env): OAuthProviderConfig | null {
  const definition = getOAuthProviderDefinition(id);
  const baseUrl = redirectBaseUrl(env);
  if (!definition || !baseUrl) return null;

  const clientId = env[definition.clientIdEnv]?.trim();
  const clientSecret = env[definition.clientSecretEnv]?.trim() || null;
  const slackPkceEnabled = id === 'slack' && env.SLACK_OAUTH_PKCE_ENABLED?.trim().toLowerCase() === 'true';
  const pkceEnabled = definition.pkce === 'required' || (definition.pkce === 'optional' && slackPkceEnabled);
  const requiresSecret = id !== 'airtable' && !(id === 'slack' && slackPkceEnabled);
  if (!clientId || (requiresSecret && !clientSecret)) return null;

  return {
    ...definition,
    clientId,
    clientSecret,
    redirectBaseUrl: baseUrl,
    redirectUri: `${baseUrl}/api/integrations/oauth/${definition.id}/callback`,
    pkceEnabled,
  };
}

export function getOAuthProviderStatuses(env: OAuthEnvironment = process.env): OAuthProviderStatus[] {
  const encodedKey = env.CREDENTIAL_ENCRYPTION_KEY?.trim() ?? '';
  let vaultReady = false;
  if (/^[A-Za-z0-9+/]{43}=$/.test(encodedKey)) {
    const decodedKey = Buffer.from(encodedKey, 'base64');
    vaultReady = decodedKey.length === 32 && decodedKey.toString('base64') === encodedKey;
  }
  return OAUTH_PROVIDER_IDS.map((id) => {
    const definition = definitions[id];
    const providerReady = getOAuthProviderConfig(id, env) !== null;
    return {
      id,
      label: definition.label,
      configured: providerReady && vaultReady,
      setupHint: !vaultReady ? 'Set a valid server-side CREDENTIAL_ENCRYPTION_KEY before enabling OAuth.' : definition.setupHint,
    };
  });
}

export function buildAuthorizationUrl(
  provider: OAuthProviderConfig,
  state: string,
  codeChallenge?: string,
): string {
  const url = new URL(provider.authorizationEndpoint);
  url.searchParams.set('client_id', provider.clientId);
  url.searchParams.set('redirect_uri', provider.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', provider.scopes.join(provider.scopeDelimiter));
  url.searchParams.set('state', state);
  if (provider.pkceEnabled && codeChallenge) {
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  if (provider.supportsOfflineAccess) {
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent');
  }
  return url.toString();
}
