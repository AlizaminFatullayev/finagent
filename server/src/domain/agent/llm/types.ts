/** Provider-neutral chat shapes, so the agent loop does not depend on one vendor's SDK. */

export type ToolDefinition = { name: string; description: string; inputSchema: Record<string, unknown> };

export type ToolCall = { id: string; name: string; input: unknown };

export type ToolResult = { toolCallId: string; content: string; isError?: boolean };

export type ChatMessage =
  | { role: 'user'; content: string }
  // `native` keeps the provider's original blocks (e.g. thinking blocks) so they are replayed unchanged.
  | { role: 'assistant'; text: string; toolCalls: ToolCall[]; native?: unknown }
  | { role: 'tool_results'; results: ToolResult[] };

export type TokenUsage = { inputTokens: number; outputTokens: number };

export type LLMResponse = {
  text: string;
  toolCalls: ToolCall[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'other';
  usage: TokenUsage;
  model: string;
  native?: unknown;
};

export type CompletionOptions = { system: string; maxTokens?: number };

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  complete(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: CompletionOptions,
  ): Promise<LLMResponse>;
}
