import OpenAI from 'openai';
import { isAIModelForProvider, type AIProvider, type AIPromptInput, type AIProviderResponse } from '../../types/ai';
import { isOpenAIStrictJsonSchema } from './json-schema';
import { AIProviderError, isTransientProviderFailure } from './errors';

const DEFAULT_MODEL = 'gpt-6-luna';
const MAX_PROMPT_CHARACTERS = 16_384;
const MAX_SYSTEM_INSTRUCTION_CHARACTERS = 4_096;
const MAX_OUTPUT_TOKENS = 2_048;
const MAX_RESPONSE_CHARACTERS = 64 * 1024;
const SDK_TIMEOUT_MS = 6_000;

interface OpenAIUsage {
  input_tokens?: unknown;
  output_tokens?: unknown;
  total_tokens?: unknown;
}

interface OpenAIResult {
  output_text?: unknown;
  model?: unknown;
  usage?: OpenAIUsage | null;
}

interface OpenAIResponsesCreateParameters {
  model: string;
  input: string;
  instructions?: string;
  max_output_tokens: number;
  text?: {
    format:
      | { type: 'json_object' }
      | { type: 'json_schema'; name: string; strict: true; schema: Record<string, unknown> };
  };
}

export interface OpenAIResponsesClient {
  responses: {
    create: (
      params: OpenAIResponsesCreateParameters,
      options?: { signal?: AbortSignal },
    ) => Promise<OpenAIResult>;
  };
}

export interface OpenAIProviderOptions {
  apiKey: string;
  model?: string;
  client?: OpenAIResponsesClient;
}

function numericUsage(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

function buildRequest(input: AIPromptInput, model: string): OpenAIResponsesCreateParameters {
  if (input.prompt.length === 0 || input.prompt.length > MAX_PROMPT_CHARACTERS) {
    throw new AIProviderError('The AI provider request failed.');
  }
  if (input.systemInstruction !== undefined && input.systemInstruction.length > MAX_SYSTEM_INSTRUCTION_CHARACTERS) {
    throw new AIProviderError('The AI provider request failed.');
  }
  if (input.maxTokens !== undefined && (!Number.isInteger(input.maxTokens) || input.maxTokens < 1 || input.maxTokens > MAX_OUTPUT_TOKENS)) {
    throw new AIProviderError('The AI provider request failed.');
  }
  if (input.responseJsonSchema && input.outputFormat !== 'json') {
    throw new AIProviderError('The AI provider request failed.');
  }

  let text: OpenAIResponsesCreateParameters['text'];
  if (input.outputFormat === 'json') {
    if (input.responseJsonSchema) {
      if (!isOpenAIStrictJsonSchema(input.responseJsonSchema)) {
        throw new AIProviderError('The AI provider request failed.');
      }
      text = {
        format: {
          type: 'json_schema',
          name: 'flowpilot_workflow_output',
          strict: true,
          schema: input.responseJsonSchema,
        },
      };
    } else {
      text = { format: { type: 'json_object' } };
    }
  }

  const instructions = [
    input.systemInstruction,
    input.outputFormat === 'json' && !input.responseJsonSchema ? 'Return a valid JSON object.' : undefined,
  ].filter((instruction): instruction is string => Boolean(instruction)).join('\n\n');

  return {
    model,
    input: input.prompt,
    ...(instructions ? { instructions } : {}),
    max_output_tokens: input.maxTokens ?? 1_024,
    ...(text ? { text } : {}),
  };
}

export class OpenAIProvider implements AIProvider {
  readonly id = 'user-openai';
  readonly name = 'OpenAI';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly client: OpenAIResponsesClient | undefined;

  constructor(options: OpenAIProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.client = options.client;
  }

  async generateCompletion(input: AIPromptInput): Promise<AIProviderResponse> {
    const apiKey = this.apiKey.trim();
    if (apiKey.length < 16 || apiKey.length > 512 || /\s/.test(apiKey)) {
      throw new AIProviderError('The selected AI provider credential is unavailable.');
    }
    if (input.abortSignal?.aborted) throw new AIProviderError('The AI request timed out.');

    const model = input.model ?? this.model;
    if (!isAIModelForProvider('openai', model)) throw new AIProviderError('The AI provider request failed.');
    const request = buildRequest(input, model);
    const client = this.client ?? (new OpenAI({ apiKey, maxRetries: 0, timeout: SDK_TIMEOUT_MS }) as unknown as OpenAIResponsesClient);

    let response: OpenAIResult;
    try {
      response = await client.responses.create(request, { signal: input.abortSignal });
    } catch (error) {
      const aborted = input.abortSignal?.aborted === true;
      if (aborted) throw new AIProviderError('The AI request timed out.');
      throw new AIProviderError('The AI provider request failed.', { retryable: isTransientProviderFailure(error, aborted) });
    }

    const text = response.output_text;
    if (typeof text !== 'string' || text.length === 0 || text.length > MAX_RESPONSE_CHARACTERS) {
      throw new AIProviderError('The AI provider request failed.');
    }

    const usage = response.usage
      ? {
          promptTokens: numericUsage(response.usage.input_tokens),
          completionTokens: numericUsage(response.usage.output_tokens),
          totalTokens: numericUsage(response.usage.total_tokens),
        }
      : undefined;

    return {
      text,
      model: typeof response.model === 'string' ? response.model : model,
      ...(usage ? { usage } : {}),
    };
  }
}
