import Anthropic from '@anthropic-ai/sdk';
import { LLMError, LLMRefusalError, LLMTimeoutError } from './errors.js';
import type { ChatMessage, CompletionOptions, LLMProvider, LLMResponse, ToolDefinition } from './types.js';

type Config = { apiKey: string; model: string; timeoutMs: number; maxRetries: number };

/** Maps SDK errors to safe AppErrors; the SDK has already retried 408/409/429/5xx with backoff. */
function toAppError(err: unknown): unknown {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new LLMTimeoutError();
  if (err instanceof Anthropic.APIConnectionError) return new LLMError('The LLM provider is unreachable');
  if (err instanceof Anthropic.AuthenticationError)
    return new LLMError('The LLM provider rejected the API key');
  if (err instanceof Anthropic.RateLimitError) return new LLMError('The LLM provider rate limit was reached');
  if (err instanceof Anthropic.APIError)
    return new LLMError(`The LLM provider returned an error (${err.status})`);
  return err;
}

function toParams(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages.map((m): Anthropic.MessageParam => {
    if (m.role === 'user') return { role: 'user', content: m.content };
    if (m.role === 'assistant') {
      // Replaying the exact content blocks keeps thinking blocks valid for the next turn.
      return { role: 'assistant', content: m.native as Anthropic.ContentBlockParam[] };
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
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: options.maxTokens ?? 16_000,
        system: options.system,
        messages: toParams(messages),
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        })),
      });
    } catch (err) {
      throw toAppError(err);
    }

    // No server-side fallback is requested, so a refusal stays a refusal. Its explanation text is
    // deliberately dropped: only the fact that the model declined is surfaced.
    if (response.stop_reason === 'refusal') throw new LLMRefusalError(this.name, response.model);

    const toolCalls = response.content.flatMap((b) =>
      b.type === 'tool_use' ? [{ id: b.id, name: b.name, input: b.input }] : [],
    );
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');
    const stop = response.stop_reason;
    return {
      text,
      toolCalls,
      stopReason: stop === 'end_turn' || stop === 'tool_use' || stop === 'max_tokens' ? stop : 'other',
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
      model: response.model,
      native: response.content,
    };
  }
}
