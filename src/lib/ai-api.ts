import type { AICredentialSummary, AIProviderId } from '@/types/ai';

export class AICredentialApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'AICredentialApiError';
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
    throw new AICredentialApiError('Credential service is unavailable.');
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Do not include request details or credentials in fallback errors.
  }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `Credential request failed (${response.status}).`;
    throw new AICredentialApiError(message, response.status);
  }
  if (payload === null) throw new AICredentialApiError('Credential service returned an invalid response.');
  return payload as T;
}

export async function listAICredentials(): Promise<AICredentialSummary[]> {
  const result = await request<{ credentials: AICredentialSummary[] }>('/api/ai-credentials');
  return result.credentials;
}

export async function createAICredential(input: {
  provider: AIProviderId;
  name: string;
  apiKey: string;
}): Promise<AICredentialSummary> {
  const result = await request<{ credential: AICredentialSummary }>('/api/ai-credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return result.credential;
}

export async function deleteAICredential(credentialId: string): Promise<void> {
  await request<{ ok: true }>(`/api/ai-credentials/${encodeURIComponent(credentialId)}`, {
    method: 'DELETE',
  });
}
