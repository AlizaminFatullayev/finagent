import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { analyzeWorkbook } from '../analysis/engine.js';
import { naturalAmounts, sheetOf } from '../analysis/testData.js';
import { SummarySchema, type Summary } from './schemas.js';
import { READ_TOOLS, SUBMIT_TOOL, toInputSchema, type AgentContext } from './tools.js';

const sheet = sheetOf(
  [
    ['customer', 'text'],
    ['amount', 'currency'],
  ],
  naturalAmounts(50).map((amount, i) => ({ customer: `[PERSON_${(i % 5) + 1}]`, amount })),
);
const ctx: AgentContext = {
  sheets: [sheet],
  engine: analyzeWorkbook([sheet], { thresholdAmount: 10_000 }),
  focusColumns: [],
};

const summary: Summary = {
  headline: 'One sheet analysed',
  keyMetrics: [{ label: 'Total', value: '1,000' }],
  trends: [],
  risks: [],
  anomalyHighlights: [{ anomalyId: 'A1', comment: 'Large outlier' }],
  recommendations: [],
  caveats: [],
};

/** A valid and an invalid input per registered tool; read tools are validated by running them. */
const CASES: Record<string, { valid: unknown; invalid: unknown }> = {
  get_workbook_overview: { valid: {}, invalid: 'not an object' },
  get_column_stats: { valid: { sheet: 'Test', column: 'amount' }, invalid: { sheet: 'Test' } },
  get_top_values: { valid: { sheet: 'Test', column: 'customer' }, invalid: { column: 3 } },
  get_anomalies: { valid: { severity: 'HIGH', limit: 5 }, invalid: { limit: 500 } },
  get_sample_rows: { valid: { sheet: 'Test', limit: 3 }, invalid: { sheet: 'Test', limit: 0 } },
  submit_summary: {
    valid: summary,
    invalid: { ...summary, anomalyHighlights: [{ anomalyId: 'X', comment: 'c' }] },
  },
};

const allKeys = (value: unknown): string[] =>
  value && typeof value === 'object' ? Object.entries(value).flatMap(([k, v]) => [k, ...allKeys(v)]) : [];

describe('tool input schemas', () => {
  const definitions = [...READ_TOOLS.map((t) => t.definition), SUBMIT_TOOL];

  it('covers every registered tool', () => {
    expect(definitions.map((d) => d.name).sort()).toEqual(Object.keys(CASES).sort());
  });

  it.each(definitions.map((d) => [d.name, d] as const))('%s is a flat object schema', (_name, d) => {
    expect(d.inputSchema.type).toBe('object');
    expect(d.inputSchema.properties).toBeTypeOf('object');
    const keys = allKeys(d.inputSchema);
    for (const keyword of ['$ref', '$defs', '$schema']) expect(keys).not.toContain(keyword);
  });

  it('keeps constraints and enums of the Zod schema', () => {
    const schema = SUBMIT_TOOL.inputSchema as {
      required: string[];
      properties: Record<string, { maxLength?: number; maxItems?: number; items?: unknown }>;
    };
    expect(schema.required).toContain('headline');
    expect(schema.properties.headline!.maxLength).toBe(400);
    expect(JSON.stringify(schema.properties.anomalyHighlights)).toContain('"pattern":"^A\\\\d+$"');
    const anomalies = READ_TOOLS.find((t) => t.definition.name === 'get_anomalies')!.definition.inputSchema;
    expect(JSON.stringify(anomalies)).toContain('"enum":["LOW","MEDIUM","HIGH"]');
  });

  it('keeps descriptions while dropping ids', () => {
    const schema = z
      .object({ a: z.string().describe('field a') })
      .meta({ id: 'ToolSchemaTest', description: 'top' });
    expect(toInputSchema(schema)).toMatchObject({
      type: 'object',
      description: 'top',
      properties: { a: { type: 'string', description: 'field a' } },
    });
  });

  it.each(Object.entries(CASES))(
    '%s still accepts valid input and rejects invalid input',
    (name, { valid, invalid }) => {
      if (name === SUBMIT_TOOL.name) {
        expect(SummarySchema.safeParse(valid).success).toBe(true);
        expect(SummarySchema.safeParse(invalid).success).toBe(false);
        return;
      }
      const tool = READ_TOOLS.find((t) => t.definition.name === name)!;
      expect(() => tool.run(valid, ctx)).not.toThrow();
      expect(() => tool.run(invalid, ctx)).toThrow(z.ZodError);
    },
  );
});
