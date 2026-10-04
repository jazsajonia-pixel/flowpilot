export type AIProviderErrorMessage =
  | 'The built-in Gemini provider is not configured.'
  | 'The selected AI provider credential is unavailable.'
  | 'The selected AI provider is not available.'
  | 'The AI request timed out.'
  | 'The AI provider request failed.';

/** Safe, fixed provider errors only; never include SDK, credential, prompt, or response text. */
export class AIProviderError extends Error {
  constructor(message: AIProviderErrorMessage) {
    super(message);
    this.name = 'AIProviderError';
  }
}
