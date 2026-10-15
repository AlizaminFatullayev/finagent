/** Masked PII token as produced by the server masker, e.g. `[PERSON_3]` or `[IBAN_1]`. */
export const TOKEN_PATTERN = /\[[A-Z]+_\d+\]/g;
const WHOLE_TOKEN = /^\[([A-Z]+)_\d+\]$/;

export type Segment = { text: string } | { token: string };

/** Splits arbitrary text into plain runs and tokens, keeping order; tokens keep their brackets. */
export function splitTokens(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_PATTERN)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ token: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export const isToken = (value: unknown): value is string =>
  typeof value === 'string' && WHOLE_TOKEN.test(value);

/** `[PERSON_3]` -> `PERSON`. */
export const tokenType = (token: string) => WHOLE_TOKEN.exec(token)?.[1] ?? null;

/** `[PERSON_3]` -> `PERSON_3`, the label the design shows inside table chips. */
export const tokenLabel = (token: string) => token.slice(1, -1);
