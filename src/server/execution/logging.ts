import type { NodeCategory } from '../../types/workflow';
import { AIProviderError } from '../ai/errors';
import { EmailNotificationError } from '../notifications/email';

export interface SafeExecutionLog {
  nodeId: string;
  status: 'success' | 'error' | 'skipped';
  timestamp: string;
  inputData?: unknown;
  outputData?: unknown;
  error?: string;
}

export function summarizeTriggerInput(input: Record<string, unknown>): Record<string, unknown> {
  return { received: true, topLevelFieldCount: Object.keys(input).length };
}

export function summarizeNodeInput(category: NodeCategory): Record<string, unknown> {
  return { category };
}

export function summarizeNodeOutput(category: NodeCategory, output: unknown): Record<string, unknown> {
  if (category === 'manual_trigger') return { started: true };
  if (category === 'send_email') return { sent: true };
  if ((category === 'gemini_ai' || category.startsWith('ai_')) && typeof output === 'object' && output !== null) {
    const result = output as { result?: unknown; model?: unknown; usage?: unknown };
    const serialized = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
    const usage = typeof result.usage === 'object' && result.usage !== null
      ? result.usage as { promptTokens?: unknown; completionTokens?: unknown; totalTokens?: unknown }
      : {};
    return {
      model: typeof result.model === 'string' ? result.model : null,
      outputType: typeof result.result === 'string' ? 'text' : 'json',
      outputCharacters: typeof serialized === 'string' ? serialized.length : 0,
      usage: {
        promptTokens: typeof usage.promptTokens === 'number' ? usage.promptTokens : null,
        completionTokens: typeof usage.completionTokens === 'number' ? usage.completionTokens : null,
        totalTokens: typeof usage.totalTokens === 'number' ? usage.totalTokens : null,
      },
    };
  }
  if (category === 'condition' && typeof output === 'object' && output !== null && 'result' in output) {
    return { result: Boolean((output as { result: unknown }).result) };
  }
  if (category === 'filter' && typeof output === 'object' && output !== null && 'items' in output) {
    const items = (output as { items: unknown }).items;
    return { outputCount: Array.isArray(items) ? items.length : 0 };
  }
  if (typeof output === 'object' && output !== null && 'status' in output) {
    const result = output as { status: unknown; responseBytes?: unknown; ok?: unknown };
    return {
      status: typeof result.status === 'number' ? result.status : null,
      ok: result.ok === true,
      responseBytes: typeof result.responseBytes === 'number' ? result.responseBytes : null,
    };
  }
  return { completed: true };
}

export function safeExecutionError(error: unknown): string {
  // Never persist exception text, stack traces, user data, URLs, or external response bodies.
  if (error instanceof AIProviderError || error instanceof EmailNotificationError) return error.message;
  return 'Node execution failed. Check the node configuration and try again.';
}
