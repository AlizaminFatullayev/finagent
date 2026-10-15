import { describe, expect, it } from 'vitest';
import { isToken, splitTokens, tokenLabel, tokenType } from './tokens';

describe('splitTokens', () => {
  it('finds tokens anywhere in a string and keeps the text around them', () => {
    expect(splitTokens('41 transfers from [PERSON_3] to [IBAN_12].')).toEqual([
      { text: '41 transfers from ' },
      { token: '[PERSON_3]' },
      { text: ' to ' },
      { token: '[IBAN_12]' },
      { text: '.' },
    ]);
  });

  it('handles adjacent tokens, edges and strings without tokens', () => {
    expect(splitTokens('[CARD_2][PHONE_1]')).toEqual([{ token: '[CARD_2]' }, { token: '[PHONE_1]' }]);
    expect(splitTokens('No PII here')).toEqual([{ text: 'No PII here' }]);
    expect(splitTokens('')).toEqual([]);
  });

  it('ignores look-alikes that the masker never produces', () => {
    expect(splitTokens('[person_3] [PERSON_] [PERSON_x] [3]')).toEqual([
      { text: '[person_3] [PERSON_] [PERSON_x] [3]' },
    ]);
  });

  it('is safe to call repeatedly (no shared regex state)', () => {
    expect(splitTokens('[A_1]')).toEqual(splitTokens('[A_1]'));
  });
});

describe('token helpers', () => {
  it('recognises whole tokens only', () => {
    expect(isToken('[EMAIL_7]')).toBe(true);
    expect(isToken('x [EMAIL_7]')).toBe(false);
    expect(isToken(42)).toBe(false);
    expect(tokenType('[IBAN_1]')).toBe('IBAN');
    expect(tokenLabel('[IBAN_1]')).toBe('IBAN_1');
  });
});
