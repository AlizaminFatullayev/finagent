import type { Column, Row } from '../../api/types';
import { Trunc } from '../../components/ui/Overlays';
import { isToken, tokenType, TOKEN_PATTERN } from '../../lib/tokens';
import { Token, TokenText } from '../reveal/Token';

export const isNumeric = (c: Column) => c.type === 'number' || c.type === 'currency' || c.type === 'percent';

/** ISO date cells as the design shows them: `2026-09-14 10:02`, or just the date at midnight. */
export function formatDateCell(value: string) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  if (!m) return value;
  return m[2] === '00:00' ? m[1]! : `${m[1]} ${m[2]}`;
}

export function formatNumberCell(value: number, column: Column) {
  return column.type === 'currency'
    ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/** One cell of masked data. Tokens become revealable chips; everything else is text. */
export function CellValue({
  value,
  column,
  selectable,
}: {
  value: unknown;
  column: Column;
  selectable?: boolean;
}) {
  if (value === null || value === undefined || value === '') return <span className="muted">—</span>;
  if (isToken(value)) return <Token token={value} selectable={selectable} />;
  if (typeof value === 'number') return <>{formatNumberCell(value, column)}</>;
  if (typeof value === 'boolean') return <>{value ? 'Yes' : 'No'}</>;
  const text = String(value);
  if (column.type === 'date') return <>{formatDateCell(text)}</>;
  // Free text may embed tokens ("transfer to [PERSON_3]"); keep them revealable instead of truncating.
  if (new RegExp(TOKEN_PATTERN.source).test(text)) return <TokenText text={text} />;
  return <Trunc text={text} className="sec" />;
}

/** Which columns hold PII, inferred from tokens in the loaded rows (docs/API_GAPS.md, gap 5). */
export function maskedColumns(rows: Row[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows ?? []) {
    for (const [key, value] of Object.entries(row.data)) {
      if (!out[key] && isToken(value)) out[key] = tokenType(value)!;
    }
  }
  return out;
}
