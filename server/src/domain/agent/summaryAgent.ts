import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { LLMRefusalError } from './llm/errors.js';
import type { ChatMessage, LLMProvider, TokenUsage, ToolResult } from './llm/types.js';
import { systemPrompt } from './prompts.js';
import { SummarySchema, type Summary } from './schemas.js';
import { READ_TOOLS, SUBMIT_TOOL, wrapToolOutput, type AgentContext } from './tools.js';

export class AgentError extends AppError {
  constructor(message: string) {
    super(502, 'AGENT_FAILED', message);
  }
}

export type AgentRun = {
  summary: Summary;
  usage: TokenUsage;
  iterations: number;
  model: string;
  /** Every tool output the model saw; verifyNumbers checks the narrative against these. */
  toolOutputs: unknown[];
};

type Options = { language: 'az' | 'en'; maxIterations: number };

/**
 * Bounded tool-use loop: the model may call read-only tools, then must submit a schema-valid
 * summary. One invalid submission is answered with the validation errors; a second one fails.
 */
export async function runSummaryAgent(
  provider: LLMProvider,
  ctx: AgentContext,
  options: Options,
): Promise<AgentRun> {
  const tools = [...READ_TOOLS.map((t) => t.definition), SUBMIT_TOOL];
  const system = systemPrompt(options.language, ctx.focusColumns);
  const messages: ChatMessage[] = [
    { role: 'user', content: 'Analyse the workbook with the tools, then call submit_summary.' },
  ];
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  const toolOutputs: unknown[] = [];
  let invalidSubmissions = 0;

  for (let iteration = 1; iteration <= options.maxIterations; iteration++) {
    const response = await provider.complete(messages, tools, { system });
    usage.inputTokens += response.usage.inputTokens;
    usage.outputTokens += response.usage.outputTokens;
    if (response.stopReason === 'refusal') throw new LLMRefusalError(provider.name, response.model);

    messages.push({
      role: 'assistant',
      text: response.text,
      toolCalls: response.toolCalls,
      native: response.native,
    });
    if (response.toolCalls.length === 0) {
      // Forced tool choice is not available on current models, so the prompt steers instead.
      messages.push({ role: 'user', content: 'Please call submit_summary with your final summary now.' });
      continue;
    }

    const results: ToolResult[] = [];
    for (const call of response.toolCalls) {
      if (call.name === SUBMIT_TOOL.name) {
        const parsed = SummarySchema.safeParse(call.input);
        if (parsed.success)
          return { summary: parsed.data, usage, iterations: iteration, model: response.model, toolOutputs };
        invalidSubmissions += 1;
        if (invalidSubmissions > 1) throw new AgentError('The LLM returned an invalid summary twice');
        results.push({
          toolCallId: call.id,
          isError: true,
          content: `Invalid summary:\n${z.prettifyError(parsed.error)}`,
        });
        continue;
      }
      const tool = READ_TOOLS.find((t) => t.definition.name === call.name);
      try {
        if (!tool) throw new Error(`Unknown tool: ${call.name}`);
        const output = tool.run(call.input, ctx);
        toolOutputs.push(output);
        results.push({ toolCallId: call.id, content: wrapToolOutput(output) });
      } catch (err) {
        // Tool errors go back to the model so it can correct its call instead of failing the run.
        results.push({
          toolCallId: call.id,
          isError: true,
          content: err instanceof Error ? err.message : 'Tool failed',
        });
      }
    }
    messages.push({ role: 'tool_results', results });
  }
  throw new AgentError(`The LLM did not finish within ${options.maxIterations} steps`);
}
