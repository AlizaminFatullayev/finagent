import { describe, expect, it } from 'vitest';
import type { ColumnSchema, ColumnType } from '../ingest/schema.js';
import { isAzPhone, isEmail, isFinShape, isValidCard, isValidIban, nameColumnCategory } from './detectors.js';
import { Masker, unmaskValue } from './masker.js';

const col = (name: string, type: ColumnType = 'text'): ColumnSchema => ({
  key: name,
  name,
  type,
  nullRatio: 0,
  distinctCount: 0,
});

describe('PII detectors', () => {
  it('validates IBANs with mod-97 and the AZ length', () => {
    expect(isValidIban('AZ21NABZ00000000137010001944')).toBe(true);
    expect(isValidIban('AZ21 NABZ 0000 0000 1370 1000 1944')).toBe(true);
    expect(isValidIban('AZ22NABZ00000000137010001944')).toBe(false); // bad check digits
    expect(isValidIban('AZ21NABZ0000000013701000194')).toBe(false); // wrong length
  });

  it('validates cards with Luhn', () => {
    expect(isValidCard('4111 1111 1111 1111')).toBe(true);
    expect(isValidCard('4111111111111112')).toBe(false);
    // A 16-digit transaction reference that fails Luhn is not a card.
    expect(isValidCard('2024010512345678')).toBe(false);
  });

  it('recognises Azerbaijani phone formats', () => {
    expect(isAzPhone('+994 50 123 45 67')).toBe(true);
    expect(isAzPhone('(055) 123-45-67')).toBe(true);
    expect(isAzPhone('994701234567')).toBe(true);
    expect(isAzPhone('123 45 67')).toBe(false);
    expect(isAzPhone('+1 202 555 0143')).toBe(false);
  });

  it('accepts FIN shape only with both letters and digits', () => {
    expect(isFinShape('5ABC12D')).toBe(true);
    expect(isFinShape('1234567')).toBe(false);
    expect(isFinShape('ABCDEFG')).toBe(false);
    expect(isEmail('a.b@bank.az')).toBe(true);
  });

  it('classifies name columns from English and Azerbaijani headers', () => {
    expect(nameColumnCategory('Müştəri')).toBe('PERSON');
    expect(nameColumnCategory('Customer Name')).toBe('PERSON');
    expect(nameColumnCategory('Şirkət')).toBe('COMPANY');
    expect(nameColumnCategory('Branch')).toBeNull();
    // "Adres" contains "ad" but is not a name column.
    expect(nameColumnCategory('Adres')).toBeNull();
  });
});

describe('Masker', () => {
  it('masks by column context and inline patterns with stable tokens', () => {
    const m = new Masker();
    expect(m.maskCell('Aysel Mammadova', col('Customer'))).toBe('[PERSON_1]');
    expect(m.maskCell('Rashad Aliyev', col('Customer'))).toBe('[PERSON_2]');
    expect(m.maskCell('Aysel Mammadova', col('Customer'))).toBe('[PERSON_1]');
    expect(m.maskCell('5abc12d', col('FIN', 'id'))).toBe('[FIN_1]');
    expect(m.maskCell(4111111111111111, col('Card No', 'id'))).toBe('[CARD_1]');
    expect(m.maskCell('Pay to AZ21NABZ00000000137010001944, call +994 50 123 45 67', col('Note'))).toBe(
      'Pay to [IBAN_1], call [PHONE_1]',
    );
    expect(m.maskCell('Client FIN: 7XY2Z9Q confirmed', col('Comment'))).toBe('Client FIN: [FIN_2] confirmed');
  });

  it('leaves amounts, dates and ordinary codes alone (false-positive guards)', () => {
    const m = new Masker();
    expect(m.maskCell(1500.5, col('Amount', 'currency'))).toBe(1500.5);
    expect(m.maskCell('2024-01-05T10:30:00.000Z', col('Date', 'date'))).toBe('2024-01-05T10:30:00.000Z');
    // A 7-char product code outside a FIN column is not a FIN.
    expect(m.maskCell('AB12CD3', col('Product code', 'id'))).toBe('AB12CD3');
    expect(m.maskCell('Branch 12, order 1234567', col('Note'))).toBe('Branch 12, order 1234567');
    expect(m.maskCell(42, col('Score', 'number'))).toBe(42);
    expect(Object.keys(m.tokens)).toHaveLength(0);
  });

  it('still catches cards and phones that type inference left in number columns', () => {
    const m = new Masker();
    expect(m.maskCell('4111111111111111', col('Ref', 'number'))).toBe('[CARD_1]');
    expect(m.maskCell('+994 55 760 20 78', col('Contact', 'number'))).toBe('[PHONE_1]');
  });

  it('round-trips through a stored token map and unmasks nested values', () => {
    const m = new Masker();
    m.maskCell('Aysel Mammadova', col('Customer'));
    const restored = Masker.fromTokens(m.tokens);
    expect(restored.maskCell('Aysel Mammadova', col('Customer'))).toBe('[PERSON_1]');
    expect(restored.maskCell('New Person', col('Customer'))).toBe('[PERSON_2]');
    expect(unmaskValue({ a: ['[PERSON_1] paid', 3] }, restored.tokens)).toEqual({
      a: ['Aysel Mammadova paid', 3],
    });
  });
});
