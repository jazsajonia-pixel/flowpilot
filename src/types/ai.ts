/**
 * Shared AI-provider contract. Provider implementations and credentials are server-only.
 */

export type AIModelType = string;
export type AIOutputFormat = 'text' | 'json';

export interface AIPromptInput {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
  outputFormat?: AIOutputFormat;
  responseJsonSchema?: Record<string, unknown>;
  abortSignal?: AbortSignal;
}

export interface AIProviderResponse {
  text: string;
  model: AIModelType;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface AIProvider {
  id: string;
  name: string;
  generateCompletion(input: AIPromptInput): Promise<AIProviderResponse>;
}
