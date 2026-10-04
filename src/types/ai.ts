/**
 * Shared AI-provider contract and curated model catalog.
 * Provider implementations and credentials remain server-only.
 */

export const AI_PROVIDER_IDS = ['gemini', 'openai'] as const;
export type AIProviderId = (typeof AI_PROVIDER_IDS)[number];
export type AIModelType = string;
export type AIOutputFormat = 'text' | 'json';

export interface AIModelOption {
  id: string;
  label: string;
  provider: AIProviderId;
  recommended?: boolean;
}

export const AI_MODEL_CATALOG: readonly AIModelOption[] = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', provider: 'gemini', recommended: true },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', provider: 'gemini' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'gemini' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'gemini' },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', provider: 'openai', recommended: true },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', provider: 'openai' },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra', provider: 'openai' },
] as const;

export const DEFAULT_AI_MODELS: Record<AIProviderId, string> = {
  gemini: 'gemini-3.8-flash',
  openai: 'gpt-6-luna',
};

export function isAIProviderId(value: unknown): value is AIProviderId {
  return typeof value === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export function isAIModelForProvider(provider: AIProviderId, model: unknown): model is string {
  return typeof model === 'string' && AI_MODEL_CATALOG.some((option) => option.provider === provider && option.id === model);
}

export function aiModelsForProvider(provider: AIProviderId): readonly AIModelOption[] {
  return AI_MODEL_CATALOG.filter((option) => option.provider === provider);
}

export interface AIPromptInput {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
  model?: AIModelType;
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

export interface AICredentialSummary {
  id: string;
  provider: AIProviderId;
  name: string;
  maskedKey: string;
  createdAt: string;
  updatedAt: string;
}
