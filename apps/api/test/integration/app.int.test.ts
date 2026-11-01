import { ApiErrorSchema, ApprovalsResponseSchema, HealthResponseSchema } from '@approvals/contracts';
import request from 'supertest';
import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import { fakeLlm } from '../fakes/fakeLlm';
import { buildTestApp } from '../fakes/testApp';

describe('GET /api/health', () => {
  it('reports the LLM as configured when a real client is injected', async () => {
    const res = await request(buildTestApp().app).get('/api/health');

    expect(res.status).toBe(200);
    expect(HealthResponseSchema.parse(res.body)).toEqual({ ok: true, llm: 'configured' });
  });

  it('reports not_configured with the unavailable client', async () => {
    const { app } = buildTestApp({ llm: new UnavailableLlmClient('no_api_key') });

    expect((await request(app).get('/api/health')).body).toEqual({ ok: true, llm: 'not_configured' });
  });

  // A configured provider can still be down (e.g. Ollama stopped), so the status bar must not claim "connected".
  const withPing = (isReachable: (signal: AbortSignal) => Promise<boolean>) =>
    buildTestApp({ llm: Object.assign(fakeLlm([]), { isReachable }) }).app;

  it('reports configured when the provider answers its reachability check', async () => {
    const res = await request(withPing(async () => true)).get('/api/health');

    expect(HealthResponseSchema.parse(res.body)).toEqual({ ok: true, llm: 'configured' });
  });

  it('reports unreachable when the provider is down', async () => {
    const res = await request(withPing(async () => false)).get('/api/health');

    expect(HealthResponseSchema.parse(res.body)).toEqual({ ok: true, llm: 'unreachable' });
  });

  it('reports unreachable, quickly, when the check hangs', async () => {
    const hanging = (signal: AbortSignal) =>
      new Promise<boolean>((resolve) => signal.addEventListener('abort', () => resolve(true)));
    const started = Date.now();

    const res = await request(withPing(hanging)).get('/api/health');

    expect(res.body).toEqual({ ok: true, llm: 'unreachable' });
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe('GET /api/approvals', () => {
  it('returns the seeded queue in seed order, matching the contract', async () => {
    const res = await request(buildTestApp().app).get('/api/approvals');

    expect(res.status).toBe(200);
    expect(ApprovalsResponseSchema.parse(res.body).items.map((i) => i.id)).toEqual(['a1', 'a2', 'a3', 'a4']);
  });
});

describe('error responses', () => {
  it('returns a JSON 404 in the error shape for unknown routes', async () => {
    const res = await request(buildTestApp().app).get('/api/nope');

    expect(res.status).toBe(404);
    expect(ApiErrorSchema.parse(res.body).error.code).toBe('not_found');
  });

  it('returns 400 invalid_request for a malformed JSON body, not an HTML page', async () => {
    const res = await request(buildTestApp().app)
      .post('/api/ai/greeting')
      .set('content-type', 'application/json')
      .send('{"localTime": ');

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(ApiErrorSchema.parse(res.body).error.code).toBe('invalid_request');
  });

  it('returns 413 in the error shape for an oversized body', async () => {
    const res = await request(buildTestApp().app)
      .post('/api/ai/help')
      .send({ question: 'x'.repeat(40_000) });

    expect(res.status).toBe(413);
    expect(ApiErrorSchema.parse(res.body).error.code).toBe('payload_too_large');
  });

  it('does not advertise Express', async () => {
    const res = await request(buildTestApp().app).get('/api/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
