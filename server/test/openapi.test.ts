import { readFileSync } from 'node:fs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('OpenAPI', () => {
  it('serves the document and the committed docs/openapi.json is up to date', async () => {
    const res = await request(createApp()).get('/docs/openapi.json').expect(200);
    const committed = JSON.parse(readFileSync(new URL('../../docs/openapi.json', import.meta.url), 'utf8'));
    // If this fails, run `npm run openapi:export` and commit the result (the React client depends on it).
    expect(res.body).toEqual(committed);
    expect(res.body.paths['/api/files/{id}/analyses'].post.responses).toHaveProperty('202');
  });

  it('serves Swagger UI', async () => {
    await request(createApp()).get('/docs/').expect(200).expect('content-type', /html/);
  });
});
