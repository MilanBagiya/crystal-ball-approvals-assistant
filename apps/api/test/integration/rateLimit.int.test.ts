import { ApiErrorSchema } from '@approvals/contracts';
import type { Express } from 'express';
import request from 'supertest';
import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import { fakeLlm } from '../fakes/fakeLlm';
import { buildTestApp } from '../fakes/testApp';

const LIMIT = 2;
const greet = (app: Express, sessionId?: string) => {
  const req = request(app).post('/api/ai/greeting').send({});
  return sessionId ? req.set('x-session-id', sessionId) : req;
};
const session = (n: number) => `session-${String(n).padStart(4, '0')}`;

function limitedApp() {
  return buildTestApp({
    llm: new UnavailableLlmClient('no_api_key'),
    config: { llmTimeoutMs: 50, rateLimitPerMin: LIMIT },
  });
}

describe('rate limiting on /api/ai/*', () => {
  it('returns 429 in the error shape once a session goes over the per-minute limit', async () => {
    const { app } = limitedApp();

    for (let i = 0; i < LIMIT; i++) expect((await greet(app, session(1))).status).toBe(200);
    const res = await greet(app, session(1));

    expect(res.status).toBe(429);
    expect(ApiErrorSchema.parse(res.body).error).toEqual({
      code: 'rate_limited',
      message: 'Too many requests, please wait a moment.',
    });
  });

  it('counts each session separately', async () => {
    const { app } = limitedApp();

    for (let i = 0; i <= LIMIT; i++) await greet(app, session(1));

    expect((await greet(app, session(2))).status).toBe(200);
  });

  it('falls back to the IP when there is no session header', async () => {
    const { app } = limitedApp();

    for (let i = 0; i < LIMIT; i++) await greet(app);

    expect((await greet(app)).status).toBe(429);
  });

  it('caps a single IP even if it rotates session ids', async () => {
    const { app } = limitedApp();
    const ipCap = LIMIT * 5;

    for (let i = 0; i < ipCap; i++) expect((await greet(app, session(i))).status).toBe(200);

    expect((await greet(app, session(999))).status).toBe(429);
  });

  it('ignores a malformed session header and keys by IP instead', async () => {
    const { app } = limitedApp();

    for (let i = 0; i < LIMIT; i++) await greet(app, `bad id ${i} ${'x'.repeat(100)}`);

    expect((await greet(app, 'another bad id!')).status).toBe(429);
  });

  it('rejects over-limit requests before calling the LLM', async () => {
    const llm = fakeLlm(['{"greeting":"Hi! 4 items."}']);
    const { app } = buildTestApp({ llm, config: { llmTimeoutMs: 50, rateLimitPerMin: LIMIT } });

    for (let i = 0; i <= LIMIT + 2; i++) await greet(app, session(1));

    expect(llm.requests).toHaveLength(LIMIT);
  });

  it('does not limit non-AI routes', async () => {
    const { app } = limitedApp();

    for (let i = 0; i < LIMIT * 6; i++) expect((await request(app).get('/api/health')).status).toBe(200);
  });
});
