import {
  DEFAULT_AI_MODELS,
  isAIModelForProvider,
  isAIProviderId,
  type AIProvider,
  type AIProviderId,
} from '../../types/ai';
import { AIProviderError } from './errors';
import { decryptCredential } from './credential-vault';
import { GeminiAIProvider } from './gemini-provider';
import { OpenAIProvider } from './openai-provider';

export interface AIProviderSelection {
  provider: AIProviderId;
  credentialId?: string;
  model?: string;
}

export interface StoredAICredential {
  id: string;
  ownerId: string;
  provider: AIProviderId;
  encryptedPayload: string;
}

export type FindOwnedCredential = (
  ownerId: string,
  credentialId: string,
  provider: AIProviderId,
) => Promise<StoredAICredential | null>;

export type AIProviderResolver = (selection: AIProviderSelection) => Promise<AIProvider>;

export function createOwnerAIProviderResolver(
  ownerId: string,
  findCredential: FindOwnedCredential,
  encodedKey?: string,
): AIProviderResolver {
  const providerCache = new Map<string, Promise<AIProvider>>();

  return async (selection) => {
    if (!isAIProviderId(selection.provider)) throw new AIProviderError('The selected AI provider is not available.');
    if (selection.model !== undefined && !isAIModelForProvider(selection.provider, selection.model)) {
      throw new AIProviderError('The selected AI provider is not available.');
    }

    if (selection.provider === 'gemini' && !selection.credentialId) {
      const cacheKey = `builtin:gemini:${selection.model ?? 'environment-default'}`;
      let provider = providerCache.get(cacheKey);
      if (!provider) {
        provider = Promise.resolve(new GeminiAIProvider(selection.model ? { model: selection.model } : {}));
        providerCache.set(cacheKey, provider);
      }
      return provider;
    }

    if (!selection.credentialId) throw new AIProviderError('The selected AI provider credential is unavailable.');
    const model = selection.model ?? DEFAULT_AI_MODELS[selection.provider];
    const cacheKey = `${selection.provider}:${selection.credentialId}:${model}`;
    let provider = providerCache.get(cacheKey);
    if (!provider) {
      provider = (async () => {
        const credential = await findCredential(ownerId, selection.credentialId as string, selection.provider);
        if (!credential || credential.ownerId !== ownerId || credential.id !== selection.credentialId || credential.provider !== selection.provider) {
          throw new AIProviderError('The selected AI provider credential is unavailable.');
        }
        let apiKey: string;
        try {
          apiKey = decryptCredential(credential.encryptedPayload, {
            ownerId,
            credentialId: credential.id,
            provider: credential.provider,
          }, encodedKey);
        } catch {
          throw new AIProviderError('The selected AI provider credential is unavailable.');
        }
        return selection.provider === 'gemini'
          ? new GeminiAIProvider({ apiKey, model })
          : new OpenAIProvider({ apiKey, model });
      })();
      providerCache.set(cacheKey, provider);
    }
    return provider;
  };
}
