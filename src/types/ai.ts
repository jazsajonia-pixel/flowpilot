/**
 * AI Provider Abstraction Interface
 * All AI providers (Gemini, OpenAI, Custom) must implement this interface.
 */

export type AIModelType = 'gemini-1.5-pro' | 'gemini-1.5-flash' | 'gpt-4o' | 'gpt-3.5-turbo' | string;

export interface AIPromptInput {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIProviderResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  raw?: unknown;
}

export interface AIProvider {
  id: string;
  name: string;
  generateCompletion(input: AIPromptInput): Promise<AIProviderResponse>;
}
