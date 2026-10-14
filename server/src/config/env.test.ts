import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  MASKING_KEY: Buffer.alloc(32, 1).toString('base64'),
  LLM_PROVIDER: 'mock',
};

describe('parseEnv', () => {
  it('applies defaults and splits CORS origins', () => {
    const env = parseEnv({ ...valid, CORS_ORIGINS: 'http://a.test, http://b.test' });
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('rejects short JWT secrets and wrong-size masking keys with a readable message', () => {
    expect(() =>
      parseEnv({ ...valid, JWT_ACCESS_SECRET: 'short', MASKING_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/JWT_ACCESS_SECRET[\s\S]*MASKING_KEY|MASKING_KEY[\s\S]*JWT_ACCESS_SECRET/);
  });

  it('requires an API key for the anthropic provider', () => {
    expect(() => parseEnv({ ...valid, LLM_PROVIDER: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('refuses placeholder secrets in production', () => {
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'change-me-but-long-enough-to-pass-min',
      }),
    ).toThrow(/placeholder/);
  });
});
