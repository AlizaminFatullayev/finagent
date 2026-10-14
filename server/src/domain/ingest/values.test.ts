import { describe, expect, it } from 'vitest';
import { normalizeCell, toBoolean, toDate, toNumber } from './values.js';

describe('cell values', () => {
  it('flattens exceljs objects and drops formula text', () => {
    expect(normalizeCell({ formula: '=HYPERLINK("evil")', result: 42 })).toBe(42);
    expect(normalizeCell({ richText: [{ text: 'Ab' }, { text: 'c' }] })).toBe('Abc');
    expect(normalizeCell({ text: 'link', hyperlink: 'http://x' })).toBe('link');
    expect(normalizeCell('  ﻿Name ')).toBe('Name');
    expect(normalizeCell('   ')).toBeNull();
    expect(normalizeCell(new Date('2024-01-02T03:04:05Z'))).toBe('2024-01-02T03:04:05.000Z');
  });

  it('parses bank-style numbers', () => {
    expect(toNumber('1,234.50')).toBe(1234.5);
    expect(toNumber('1.234,50')).toBe(1234.5);
    expect(toNumber('12,5')).toBe(12.5);
    expect(toNumber('(1,200.00)')).toBe(-1200);
    expect(toNumber('₼ 9 999')).toBe(9999);
    expect(toNumber('15%')).toBe(15);
    expect(toNumber('AZ21NABZ0000')).toBeNull();
    expect(toNumber('12abc')).toBeNull();
  });

  it('parses ISO and day-first dates as UTC wall-clock time', () => {
    expect(toDate('2024-03-05')?.toISOString()).toBe('2024-03-05T00:00:00.000Z');
    expect(toDate('2024-03-05 23:15')?.toISOString()).toBe('2024-03-05T23:15:00.000Z');
    expect(toDate('05.03.2024 08:30')?.toISOString()).toBe('2024-03-05T08:30:00.000Z');
    expect(toDate('31.02.2024')).toBeNull();
    expect(toDate('hello')).toBeNull();
  });

  it('parses English and Azerbaijani booleans', () => {
    expect(toBoolean('Bəli')).toBe(true);
    expect(toBoolean('xeyr')).toBe(false);
    expect(toBoolean('maybe')).toBeNull();
  });
});
