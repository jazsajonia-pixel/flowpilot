import type { IntegrationsResponse, OAuthProviderId } from '@/types/integrations';

export class IntegrationApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'IntegrationApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...init,
    });
  } catch {
    throw new IntegrationApiError('Integration service is unavailable.');
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Never expose provider responses or request data in fallback errors.
  }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `Integration request failed (${response.status}).`;
    throw new IntegrationApiError(message, response.status);
  }
  if (payload === null) throw new IntegrationApiError('Connected-app API returned a non-JSON response. Use the Vercel app preview to check live integration setup.');
  return payload as T;
}

export async function listIntegrations(): Promise<IntegrationsResponse> {
  return request<IntegrationsResponse>('/api/integrations');
}

export async function beginIntegrationConnect(provider: OAuthProviderId): Promise<string> {
  const result = await request<{ authorizationUrl: string }>(`/api/integrations/${encodeURIComponent(provider)}/connect`, {
    method: 'POST',
  });
  const url = new URL(result.authorizationUrl);
  if (url.protocol !== 'https:') throw new IntegrationApiError('Provider authorization URL is invalid.');
  return url.toString();
}

export interface DisconnectResult {
  ok: true;
  remoteRevocation: 'confirmed' | 'unavailable' | 'unconfirmed';
}

export async function disconnectIntegration(provider: OAuthProviderId, integrationId: string): Promise<DisconnectResult> {
  return request<DisconnectResult>(`/api/integrations/${encodeURIComponent(provider)}/${encodeURIComponent(integrationId)}`, {
    method: 'DELETE',
  });
}
