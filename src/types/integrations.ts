export const OAUTH_PROVIDER_IDS = ['gmail', 'slack', 'airtable'] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDER_IDS)[number];

export interface OAuthProviderStatus {
  id: OAuthProviderId;
  label: string;
  configured: boolean;
  setupHint: string;
}

export interface ConnectedIntegration {
  id: string;
  provider: OAuthProviderId;
  name: string;
  status: 'connected' | 'reauth_required' | 'pending' | 'disconnected';
  scopes: string[];
  accessTokenExpiresAt: string | null;
  updatedAt: string;
}

export interface IntegrationsResponse {
  providers: OAuthProviderStatus[];
  accounts: ConnectedIntegration[];
}
