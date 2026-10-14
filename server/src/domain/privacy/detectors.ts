/**
 * PII detectors. Each one prefers missing an odd value over masking ordinary data,
 * so checksums (IBAN mod-97, card Luhn) and column context are required where possible.
 */

export type PiiCategory = 'PERSON' | 'COMPANY' | 'FIN' | 'IBAN' | 'CARD' | 'PHONE' | 'EMAIL';

const compact = (s: string) => s.replace(/[\s-]/g, '');

/** ISO 13616 mod-97 check: rejects random strings that merely look like an IBAN. */
export function isValidIban(raw: string): boolean {
  const s = compact(raw).toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  // Azerbaijani IBANs have a fixed length of 28.
  if (s.startsWith('AZ') && s.length !== 28) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  return remainder === 1;
}

/** Card numbers must pass Luhn; 13-19 digits as per ISO/IEC 7812. */
export function isValidCard(raw: string): boolean {
  const s = compact(raw);
  if (!/^\d{13,19}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    let d = Number(s[s.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** +994 / 994 / 0 followed by an Azerbaijani operator or city code and 7 digits. */
export function isAzPhone(raw: string): boolean {
  return /^(\+?994|0)(10|12|50|51|55|60|70|77|99)\d{7}$/.test(raw.replace(/[\s\-()]/g, ''));
}

export const isEmail = (raw: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(raw);

/**
 * FIN (Azerbaijani personal ID): 7 letters/digits. On its own that shape matches many codes,
 * so callers only apply this inside a FIN-labelled column or right after a "FIN" keyword.
 */
export const isFinShape = (raw: string) => /^(?=.*\d)(?=.*[A-Z])[0-9A-Z]{7}$/.test(raw.trim());

export const FIN_HEADER = /(^|[^a-z])(fin|pin|fin[\s_-]?kod|şəxsiyyət)([^a-z]|$)/i;
const PERSON_HEADER =
  /(^|[^a-zəöüğıçş])(name|full[\s_]?name|first[\s_]?name|last[\s_]?name|surname|ad|soyad|ata[\s_]?adı|müştəri|musteri|customer|client|payee|beneficiary|sender|receiver|alıcı|göndərən|employee|işçi|owner|sahib)([^a-zəöüğıçş]|$)/i;
const COMPANY_HEADER = /(company|şirkət|sirket|firm|employer|organization|təşkilat|merchant)/i;

/** Classifies a whole column as holding names, from its header alone. */
export function nameColumnCategory(header: string): 'PERSON' | 'COMPANY' | null {
  if (COMPANY_HEADER.test(header)) return 'COMPANY';
  if (PERSON_HEADER.test(header)) return 'PERSON';
  return null;
}

/** Patterns for PII embedded in free text, each confirmed by its validator before masking. */
export const INLINE_PATTERNS: { category: PiiCategory; pattern: RegExp; valid: (s: string) => boolean }[] = [
  { category: 'EMAIL', pattern: /[^\s@<>()"',;]+@[^\s@<>()"',;]+\.[a-z]{2,}/gi, valid: isEmail },
  {
    category: 'IBAN',
    pattern: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g,
    valid: isValidIban,
  },
  { category: 'CARD', pattern: /\b\d(?:[ -]?\d){12,18}\b/g, valid: isValidCard },
  {
    category: 'PHONE',
    pattern: /(?:\+?994|\b0)[\s\-(]*\d{2}[\s\-)]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b/g,
    valid: isAzPhone,
  },
  // FIN only directly after the keyword, e.g. "FIN: 5ABC12D".
  { category: 'FIN', pattern: /(?<=\bFIN\s*[:#-]?\s*)[0-9A-Z]{7}\b/g, valid: isFinShape },
];
