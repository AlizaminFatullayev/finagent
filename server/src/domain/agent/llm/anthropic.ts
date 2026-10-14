import Anthropic from '@anthropic-ai/sdk';
import { UpstreamError } from '../../../lib/errors.js';
import type { ChatMessage, CompletionOptions, LLMProvider, LLMResponse, ToolDefinition } from './types.js';

type Config = { apiKey: string; model: string; timeoutMs: number; maxRetries: number };

/** Maps SDK errors to safe AppErrors; the SDK has already retried 408/409/429/5xx with backoff. */
function toAppError(err: unknown): unknown {
  if (err instanceof Anthropic.APIConnectionTimeoutError)
    return new UpstreamError('The LLM provider timed out');
  if (err instanceof Anthropic.APIConnectionError)
    return new UpstreamError('The LLM provider is unreachable');
  if (err instanceof Anthropic.AuthenticationError)
    return new UpstreamError('The LLM provider rejected the API key');
  if (err instanceof Anthropic.RateLimitError)
    return new UpstreamError('The LLM provider rate limit was reached');
  if (err instanceof Anthropic.APIError)
    return new UpstreamError(`The LLM provider returned an error (${err.status})`);
  return err;
}

function toParams(messages: ChatMessage[]): Anthropic.Beta.BetaMessageParam[] {
  return messages.map((m): Anthropic.Beta.BetaMessageParam => {
    if (m.role === 'user') return { role: 'user', content: m.content };
    if (m.role === 'assistant') {
      // Replaying the exact content blocks keeps thinking blocks valid for the next turn.
      return { role: 'assistant', content: m.native as Anthropic.Beta.BetaContentBlockParam[] };
    }
    return {
      role: 'user',
      content: m.results.map((r) => ({
        type: 'tool_result' as const,
        tool_use_id: r.toolCallId,
        content: r.content,
        is_error: r.isError ?? false,
      })),
    };
  });
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private readonly client: Anthropic;

  constructor(config: Config) {
    this.model = config.model;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeoutMs,
      maxRetries: config.maxRetries,
    });
  }

  async complete(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: CompletionOptions,
  ): Promise<LLMResponse> {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: options.maxTokens ?? 16_000,
        system: options.system,
        messages: toParams(messages),
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
        })),
        // On a safety-classifier decline the API re-runs the request on a recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
    } catch (err) {
      throw toAppError(err);
    }

    const toolCalls = response.content.flatMap((b) =>
      b.type === 'tool_use' ? [{ id: b.id, name: b.name, input: b.input }] : [],
    );
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');
    const stop = response.stop_reason;
    return {
      text,
      toolCalls,
      stopReason:
        stop === 'end_turn' || stop === 'tool_use' || stop === 'max_tokens' || stop === 'refusal'
          ? stop
          : 'other',
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
      model: response.model,
      native: response.content,
    };
  }
}
