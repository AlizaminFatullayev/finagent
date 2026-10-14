import { z } from 'zod';
import type { EngineResult } from '../analysis/engine.js';
import type { AnalysisSheet } from '../analysis/types.js';
import { SummarySchema } from './schemas.js';
import type { ToolDefinition } from './llm/types.js';

/** Everything a tool may read: already-masked sheets and the engine's computed results. Nothing else. */
export type AgentContext = { sheets: AnalysisSheet[]; engine: EngineResult; focusColumns: string[] };

const MAX_SAMPLE_ROWS = 20;

const SheetColumnInput = z.object({ sheet: z.string(), column: z.string() });

type Tool = { definition: ToolDefinition; run: (input: unknown, ctx: AgentContext) => unknown };

/**
 * Providers require a flat `type: "object"` input schema. Ids registered with `.meta({ id })` (used
 * for OpenAPI components) would otherwise turn the top level into a `$ref`, so an empty registry is
 * used, descriptions are copied back from the global one, and cycles throw instead of emitting `$ref`.
 */
export function toInputSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _, ...json } = z.toJSONSchema(schema, {
    metadata: z.registry(),
    cycles: 'throw',
    override: ({ zodSchema, jsonSchema }) => {
      const description = z.globalRegistry.get(zodSchema)?.description;
      if (description) jsonSchema.description = description;
    },
  });
  return json;
}

const define = (
  name: string,
  description: string,
  schema: z.ZodType,
  run: (input: never, ctx: AgentContext) => unknown,
): Tool => ({
  definition: { name, description, inputSchema: toInputSchema(schema) },
  // Inputs come from the model, so they are validated like any other untrusted request.
  run: (input, ctx) => run(schema.parse(input) as never, ctx),
});

function findColumn(ctx: AgentContext, sheetName: string, column: string) {
  const stats = ctx.engine.stats.find((s) => s.sheet === sheetName);
  const col = stats?.columns.find((c) => c.name === column || c.key === column);
  if (!stats || !col) throw new Error(`Unknown sheet/column: ${sheetName}/${column}`);
  return col;
}

/**
 * Read-only tools. None can write, delete or reach the network: they only read the in-memory
 * context built before the loop starts, so a prompt-injected instruction has nothing to act on.
 */
export const READ_TOOLS: Tool[] = [
  define(
    'get_workbook_overview',
    'Sheets, row counts, column names/types, totals of amount columns, anomaly counts by severity.',
    z.object({}),
    (_input, ctx) => ({
      sheets: ctx.engine.stats.map((s) => ({
        name: s.sheet,
        rowCount: s.rowCount,
        columns: s.columns.map((c) => ({ name: c.name, type: c.type, nullRate: c.nullRate })),
        amountTotals: s.columns
          .filter((c) => c.type === 'currency' && c.numeric)
          .map((c) => ({ column: c.name, sum: c.numeric!.sum, mean: c.numeric!.mean })),
      })),
      severityCounts: ctx.engine.severityCounts,
      focusColumns: ctx.focusColumns,
    }),
  ),
  define(
    'get_column_stats',
    'Full computed statistics for one column.',
    SheetColumnInput,
    (input: z.infer<typeof SheetColumnInput>, ctx) => findColumn(ctx, input.sheet, input.column),
  ),
  define(
    'get_top_values',
    'Most frequent values of a text/id column (PII appears as tokens such as [PERSON_1]).',
    SheetColumnInput,
    (input: z.infer<typeof SheetColumnInput>, ctx) => {
      const col = findColumn(ctx, input.sheet, input.column);
      return { column: col.name, distinctCount: col.distinctCount ?? null, topValues: col.topValues ?? [] };
    },
  ),
  define(
    'get_anomalies',
    'Anomalies detected by the deterministic rules, most severe first, with the exact metrics behind each.',
    z.object({
      severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    (input: { severity?: string; limit: number }, ctx) => ({
      anomalies: ctx.engine.anomalies
        .filter((a) => !input.severity || a.severity === input.severity)
        .slice(0, input.limit)
        .map((a) => ({ ...a, rowIndexes: a.rowIndexes.slice(0, 10) })),
    }),
  ),
  define(
    'get_sample_rows',
    `Up to ${MAX_SAMPLE_ROWS} masked rows from a sheet, for context only.`,
    z.object({ sheet: z.string(), limit: z.number().int().min(1).max(MAX_SAMPLE_ROWS).default(10) }),
    (input: { sheet: string; limit: number }, ctx) => {
      const sheet = ctx.sheets.find((s) => s.name === input.sheet);
      if (!sheet) throw new Error(`Unknown sheet: ${input.sheet}`);
      return { sheet: sheet.name, rows: sheet.rows.slice(0, input.limit) };
    },
  ),
];

export const SUBMIT_TOOL: ToolDefinition = {
  name: 'submit_summary',
  description: 'Submit the final structured summary. Call exactly once, when done.',
  inputSchema: toInputSchema(SummarySchema),
};

/**
 * Tool output is wrapped in delimiters that mark it as data. Any closing delimiter inside cell
 * content is defused so a cell cannot "end" the data block and smuggle in instructions.
 */
export function wrapToolOutput(value: unknown) {
  const json = JSON.stringify(value).replace(/<\/?workbook_data/gi, (m) => m.replace('<', '&lt;'));
  return `<workbook_data>\n${json}\n</workbook_data>`;
}
