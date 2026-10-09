/**
 * Validation and bounds for owner-private data records (Create/Update Database Record actions).
 * Storage is injected so the engine stays database-agnostic and testable.
 */

export const MAX_RECORDS_PER_OWNER = 1_000;
export const MAX_RECORD_WRITES_PER_RUN = 10;
export const MAX_RECORD_DATA_BYTES = 16 * 1024;
export const MAX_RECORD_KEY_CHARACTERS = 128;
export const COLLECTION_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export type DataRecordErrorMessage =
  | 'Database records are not available for this run.'
  | 'Collection names use 1-64 lowercase letters, numbers, hyphens, or underscores.'
  | 'Record keys must be 1-128 characters.'
  | 'Record data must be a JSON object up to 16 KiB.'
  | 'A record with this key already exists.'
  | 'Record limit reached for this account.'
  | 'Record not found.'
  | 'Record write limit reached for this run.';

/** Safe, fixed record errors; never include record keys or data. */
export class DataRecordError extends Error {
  constructor(message: DataRecordErrorMessage) {
    super(message);
    this.name = 'DataRecordError';
  }
}

export type UpdateMode = 'merge' | 'replace';

export interface OwnerDataStore {
  /** Insert unless the key exists or the owner is at the record cap. */
  create: (collection: string, key: string, data: Record<string, unknown>, signal?: AbortSignal) => Promise<'created' | 'exists' | 'limit'>;
  /** Update an existing record; resolves false when it does not exist. */
  update: (collection: string, key: string, data: Record<string, unknown>, mode: UpdateMode, signal?: AbortSignal) => Promise<boolean>;
}

export function validateCollection(value: unknown): string {
  if (typeof value !== 'string' || !COLLECTION_NAME_PATTERN.test(value)) {
    throw new DataRecordError('Collection names use 1-64 lowercase letters, numbers, hyphens, or underscores.');
  }
  return value;
}

export function validateRecordKey(value: unknown): string {
  const key = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof key !== 'string') throw new DataRecordError('Record keys must be 1-128 characters.');
  const trimmed = key.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!trimmed || trimmed.length > MAX_RECORD_KEY_CHARACTERS) throw new DataRecordError('Record keys must be 1-128 characters.');
  return trimmed;
}

export function validateRecordData(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DataRecordError('Record data must be a JSON object up to 16 KiB.');
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > MAX_RECORD_DATA_BYTES) {
    throw new DataRecordError('Record data must be a JSON object up to 16 KiB.');
  }
  return JSON.parse(serialized) as Record<string, unknown>;
}

/** Per-run write budget around an owner-bound store. */
export function withRunWriteLimit(store: OwnerDataStore): OwnerDataStore {
  let writes = 0;
  const reserve = () => {
    if (writes >= MAX_RECORD_WRITES_PER_RUN) throw new DataRecordError('Record write limit reached for this run.');
    writes += 1;
  };
  return {
    create: async (...args) => { reserve(); return store.create(...args); },
    update: async (...args) => { reserve(); return store.update(...args); },
  };
}
