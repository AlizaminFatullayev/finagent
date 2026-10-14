import type { Summary } from '../agent/schemas.js';

export type Verification = { checked: number; verified: number; unverified: string[] };

// Numbers as people write them: 1,234.56 / 1234,5 / 12.5% / -300 / 1 250 000.
const NUMBER = /-?\d{1,3}(?:[ ,]\d{3})+(?:\.\d+)?|-?\d+(?:[.,]\d+)?/g;

const toNumber = (raw: string) => {
  const s = raw.replace(/ /g, '');
  // "1,234" is a thousands separator; "12,5" is a decimal comma.
  const normalised = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  return Number(normalised);
};

function collectNumbers(value: unknown, out: Set<number>) {
  if (typeof value === 'number') out.add(value);
  else if (typeof value === 'string') for (const m of value.match(NUMBER) ?? []) out.add(toNumber(m));
  else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectNumbers(v, out));
}

/** A cited figure matches a source number if equal after rounding to the precision it was written with. */
function matches(cited: number, decimals: number, sources: Set<number>) {
  const f = 10 ** decimals;
  for (const s of sources) {
    if (Math.round(s * f) / f === cited) return true;
    // Shares are stored as ratios (0.125) but written as percentages (12.5%).
    if (Math.round(s * 100 * f) / f === cited) return true;
  }
  return false;
}

/**
 * Best-effort check that each number in the narrative appears in some tool output. It cannot
 * prove a sentence is right, but it catches invented or mis-copied figures.
 */
export function verifyNumbers(summary: Summary, toolOutputs: unknown[]): Verification {
  const sources = new Set<number>();
  collectNumbers(toolOutputs, sources);

  const texts = [
    summary.headline,
    ...summary.keyMetrics.flatMap((m) => [m.label, m.value]),
    ...summary.trends,
    ...summary.risks,
    ...summary.anomalyHighlights.map((h) => h.comment),
    ...summary.recommendations,
  ];
  const cited = new Set(
    texts.flatMap((t) => t.replace(/\bA\d+\b/g, '').match(NUMBER) ?? []).map((raw) => raw.trim()),
  );

  const unverified: string[] = [];
  let checked = 0;
  for (const raw of cited) {
    const value = toNumber(raw);
    // Small integers (counts like "3 risks", list numbering) are too common to check meaningfully.
    if (!Number.isFinite(value) || (Number.isInteger(value) && Math.abs(value) <= 10)) continue;
    checked += 1;
    // Precision is whatever the author wrote after the decimal point (after normalising separators).
    const decimals = String(value).split('.')[1]?.length ?? 0;
    if (!matches(value, decimals, sources)) unverified.push(raw);
  }
  return { checked, verified: checked - unverified.length, unverified };
}
