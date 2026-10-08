import { GoogleGenAI, type GenerateContentConfig, type GenerateContentResponse } from '@google/genai';
import { isAIModelForProvider, type AIProvider, type AIPromptInput, type AIProviderResponse } from '../../types/ai';
import { AIProviderError, isTransientProviderFailure } from './errors';

export { AIProviderError } from './errors';

const DEFAULT_MODEL = 'gemini-3.8-flash';
const MAX_PROMPT_CHARACTERS = 16_384;
const MAX_SYSTEM_INSTRUCTION_CHARACTERS = 4_096;
const MAX_OUTPUT_TOKENS = 2_048;

export interface GeminiGenerationClient {
  models: {
    generateContent: (params: {
      model: string;
      contents: string;
      config?: GenerateContentConfig;
    }) => Promise<GenerateContentResponse>;
  };
}

export interface GeminiProviderOptions {
  apiKey?: string;
  model?: string;
  client?: GeminiGenerationClient;
}

function numericUsage(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

function readModelId(value: string | undefined): string {
  const model = value?.trim() || DEFAULT_MODEL;
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(model)) throw new AIProviderError('The AI provider request failed.');
  return model;
}

function buildConfig(input: AIPromptInput): GenerateContentConfig {
  if (input.prompt.length === 0 || input.prompt.length > MAX_PROMPT_CHARACTERS) {
    throw new AIProviderError('The AI provider request failed.');
  }
  if (input.systemInstruction !== undefined && input.systemInstruction.length > MAX_SYSTEM_INSTRUCTION_CHARACTERS) {
    throw new AIProviderError('The AI provider request failed.');
  }
  if (input.temperature !== undefined && (!Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2)) {
    throw new AIProviderError('The AI provider request failed.');
  }
  if (input.maxTokens !== undefined && (!Number.isInteger(input.maxTokens) || input.maxTokens < 1 || input.maxTokens > MAX_OUTPUT_TOKENS)) {
    throw new AIProviderError('The AI provider request failed.');
  }
  if (input.responseJsonSchema && input.outputFormat !== 'json') {
    throw new AIProviderError('The AI provider request failed.');
  }

  return {
    ...(input.systemInstruction ? { systemInstruction: input.systemInstruction } : {}),
    ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
    maxOutputTokens: input.maxTokens ?? 1_024,
    ...(input.outputFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
    ...(input.responseJsonSchema ? { responseJsonSchema: input.responseJsonSchema } : {}),
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
  };
}

export class GeminiAIProvider implements AIProvider {
  readonly id = 'flowpilot-gemini';
  readonly name = 'FlowPilot Gemini';
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly client: GeminiGenerationClient | undefined;

  constructor(options: GeminiProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    this.model = readModelId(options.model ?? process.env.GEMINI_MODEL_ID);
    this.client = options.client;
  }

  async generateCompletion(input: AIPromptInput): Promise<AIProviderResponse> {
    const apiKey = this.apiKey?.trim();
    if (!apiKey) throw new AIProviderError('The built-in Gemini provider is not configured.');
    if (input.abortSignal?.aborted) throw new AIProviderError('The AI request timed out.');
    if (input.model !== undefined && !isAIModelForProvider('gemini', input.model)) {
      throw new AIProviderError('The AI provider request failed.');
    }

    const model = input.model ?? this.model;
    const config = buildConfig(input);
    const client = this.client ?? new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
    let response: GenerateContentResponse;
    try {
      response = await client.models.generateContent({ model, contents: input.prompt, config });
    } catch (error) {
      const aborted = input.abortSignal?.aborted === true;
      if (aborted) throw new AIProviderError('The AI request timed out.');
      throw new AIProviderError('The AI provider request failed.', { retryable: isTransientProviderFailure(error, aborted) });
    }

    const text = response.text;
    if (typeof text !== 'string' || text.length === 0 || text.length > 64 * 1024) {
      throw new AIProviderError('The AI provider request failed.');
    }
    const usageMetadata = response.usageMetadata;
    const usage = usageMetadata
      ? {
          promptTokens: numericUsage(usageMetadata.promptTokenCount),
          completionTokens: numericUsage(usageMetadata.candidatesTokenCount),
          totalTokens: numericUsage(usageMetadata.totalTokenCount),
        }
      : undefined;

    return {
      text,
      model: response.modelVersion || model,
      ...(usage ? { usage } : {}),
    };
  }
}
