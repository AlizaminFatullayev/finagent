import type { ColumnSchema } from '../ingest/schema.js';
import type { Cell } from '../ingest/values.js';
import {
  FIN_HEADER,
  INLINE_PATTERNS,
  isAzPhone,
  isFinShape,
  isValidCard,
  nameColumnCategory,
  type PiiCategory,
} from './detectors.js';

/** token -> original value, e.g. { "[PERSON_3]": "Aysel Mammadova" } */
export type TokenMap = Record<string, string>;

type Row = { rowIndex: number; data: Record<string, Cell> };

/**
 * Replaces PII with stable tokens: the same value always gets the same token within a file,
 * so masked data keeps its analytical shape (duplicates, top payees) without the identities.
 */
export class Masker {
  private readonly byValue = new Map<string, string>();
  private readonly counters = new Map<PiiCategory, number>();
  readonly tokens: TokenMap = {};

  /** Rebuilds a masker from a stored vault, so later reads reuse exactly the same tokens. */
  static fromTokens(tokens: TokenMap) {
    const masker = new Masker();
    for (const [token, value] of Object.entries(tokens)) {
      const [, category, n] = /^\[([A-Z]+)_(\d+)\]$/.exec(token) ?? [];
      if (!category || !n) continue;
      masker.remember(category as PiiCategory, value, token);
      masker.counters.set(
        category as PiiCategory,
        Math.max(masker.counters.get(category as PiiCategory) ?? 0, Number(n)),
      );
    }
    return masker;
  }

  private remember(category: PiiCategory, value: string, token: string) {
    this.byValue.set(`${category}:${value}`, token);
    this.tokens[token] = value;
  }

  private tokenFor(category: PiiCategory, value: string) {
    const existing = this.byValue.get(`${category}:${value}`);
    if (existing) return existing;
    const n = (this.counters.get(category) ?? 0) + 1;
    this.counters.set(category, n);
    const token = `[${category}_${n}]`;
    this.remember(category, value, token);
    return token;
  }

  /** Masks PII found inside a free-text string (emails, IBANs, cards, phones, keyword-tagged FINs). */
  maskText(text: string): string {
    let out = text;
    for (const { category, pattern, valid } of INLINE_PATTERNS) {
      out = out.replace(pattern, (match) => (valid(match) ? this.tokenFor(category, match.trim()) : match));
    }
    return out;
  }

  maskCell(value: Cell, column: ColumnSchema): Cell {
    if (value === null || typeof value === 'boolean') return value;
    // Amounts, rates and dates are analytical data, never identifiers.
    if (column.type === 'currency' || column.type === 'percent' || column.type === 'date') return value;
    const s = String(value).trim();
    // Plain number columns are only checked for checksum-validated cards and phone formats, the
    // two identifiers that type inference can mistake for numbers.
    if (column.type === 'number') {
      if (isValidCard(s)) return this.tokenFor('CARD', s);
      return isAzPhone(s) ? this.tokenFor('PHONE', s) : value;
    }

    if (FIN_HEADER.test(column.name) && isFinShape(s.toUpperCase()))
      return this.tokenFor('FIN', s.toUpperCase());
    // Card numbers stored as plain numbers in an ID column still pass through the Luhn check.
    if (typeof value === 'number') return isValidCard(s) ? this.tokenFor('CARD', s) : value;
    const nameCategory = column.type === 'text' ? nameColumnCategory(column.name) : null;
    if (nameCategory) return this.tokenFor(nameCategory, s);
    return this.maskText(s);
  }

  maskRows(rows: Row[], columns: ColumnSchema[]): Row[] {
    return rows.map((r) => ({
      rowIndex: r.rowIndex,
      data: Object.fromEntries(columns.map((c) => [c.key, this.maskCell(r.data[c.key] ?? null, c)])),
    }));
  }
}

/** Replaces tokens with their original values (server-side, for authorized users only). */
export function unmaskValue(value: unknown, tokens: TokenMap): unknown {
  if (typeof value === 'string') return value.replace(/\[[A-Z]+_\d+\]/g, (t) => tokens[t] ?? t);
  if (Array.isArray(value)) return value.map((v) => unmaskValue(v, tokens));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unmaskValue(v, tokens)]));
  }
  return value;
}
