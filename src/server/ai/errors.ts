export type AIProviderErrorMessage =
  | 'The built-in Gemini provider is not configured.'
  | 'The selected AI provider credential is unavailable.'
  | 'The selected AI provider is not available.'
  | 'The AI request timed out.'
  | 'The AI provider request failed.';

/** Safe, fixed provider errors only; never include SDK, credential, prompt, or response text. */
export class AIProviderError extends Error {
  /** True when the failure looks temporary (rate limit, server error, dropped connection). */
  readonly retryable: boolean;

  constructor(message: AIProviderErrorMessage, options: { retryable?: boolean } = {}) {
    super(message);
    this.name = 'AIProviderError';
    this.retryable = options.retryable === true;
  }
}

const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Classify an SDK failure without reading its message: transient HTTP statuses, or a
 * connection failure with no HTTP status, are retryable. Aborts (time budget) are not.
 */
export function isTransientProviderFailure(error: unknown, aborted: boolean): boolean {
  if (aborted) return false;
  if (typeof error !== 'object' || error === null) return false;
  const status = (error as { status?: unknown }).status;
  if (typeof status === 'number') return TRANSIENT_HTTP_STATUSES.has(status);
  return error instanceof Error && error.name !== 'AbortError';
}
