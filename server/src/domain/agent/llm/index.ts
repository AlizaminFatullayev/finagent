import { env } from '../../../config/env.js';
import { AnthropicProvider } from './anthropic.js';
import { MockProvider } from './mock.js';
import type { LLMProvider } from './types.js';

export function createProvider(): LLMProvider {
  if (env.LLM_PROVIDER === 'mock') return new MockProvider();
  return new AnthropicProvider({
    // Presence is enforced by the env schema when LLM_PROVIDER=anthropic.
    apiKey: env.ANTHROPIC_API_KEY ?? '',
    model: env.LLM_MODEL,
    timeoutMs: env.LLM_TIMEOUT_MS,
    maxRetries: env.LLM_MAX_RETRIES,
  });
}
