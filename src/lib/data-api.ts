export interface DataCollectionSummary { name: string; count: number; updatedAt: string }
export interface DataRecordSummary { key: string; data: Record<string, unknown>; createdAt: string; updatedAt: string }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init });
  } catch {
    throw new Error('Data service is unavailable.');
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `Data request failed (${response.status}).`;
    throw new Error(message);
  }
  return payload as T;
}

export async function listDataCollections(): Promise<DataCollectionSummary[]> {
  return (await request<{ collections: DataCollectionSummary[] }>('/api/data-records')).collections;
}

export async function listDataRecords(collection: string): Promise<DataRecordSummary[]> {
  return (await request<{ records: DataRecordSummary[] }>(`/api/data-records?collection=${encodeURIComponent(collection)}`)).records;
}

export async function deleteDataRecord(collection: string, key: string): Promise<void> {
  await request(`/api/data-records?collection=${encodeURIComponent(collection)}&key=${encodeURIComponent(key)}`, { method: 'DELETE' });
}
