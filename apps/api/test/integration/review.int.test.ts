import { ApiErrorSchema, ReviewResponseSchema } from '@approvals/contracts';
import request from 'supertest';
import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import { fakeLlm } from '../fakes/fakeLlm';
import { buildTestApp } from '../fakes/testApp';

const checks = JSON.stringify({
  checks: [
    { check: 'Plays end to end', why: 'Videos must play fully.', chunkId: 'content-checks-by-type' },
    { check: 'No unblurred faces', why: 'Personal data must be blurred.', chunkId: 'content-checks-by-type' },
  ],
});

describe('POST /api/ai/review', () => {
  it('returns a validated AI checklist for the item', async () => {
    const { app, usage } = buildTestApp({ llm: fakeLlm([checks]) });

    const res = await request(app).post('/api/ai/review').send({ itemId: 'a2' });

    expect(res.status).toBe(200);
    expect(ReviewResponseSchema.parse(res.body)).toMatchObject({ itemId: 'a2', source: 'ai' });
    expect(usage).toMatchObject([{ promptId: 'review', promptVersion: '1.0.0', outcome: 'ok' }]);
  });

  it('answers 200 with the policy checklist when there is no API key', async () => {
    const { app } = buildTestApp({ llm: new UnavailableLlmClient('no_api_key') });

    const res = await request(app).post('/api/ai/review').send({ itemId: 'a3' });

    expect(res.status).toBe(200);
    expect(ReviewResponseSchema.parse(res.body)).toMatchObject({ source: 'fallback', fallbackReason: 'no_api_key' });
  });

  it('returns 404 for an unknown item and 409 for one already decided', async () => {
    const { app } = buildTestApp({ llm: fakeLlm([checks]) });

    const missing = await request(app).post('/api/ai/review').send({ itemId: 'zz' });
    await request(app).post('/api/approvals/a2/decision').send({ decision: 'approve' });
    const decided = await request(app).post('/api/ai/review').send({ itemId: 'a2' });

    expect([missing.status, decided.status]).toEqual([404, 409]);
    expect(ApiErrorSchema.parse(decided.body).error.code).toBe('already_decided');
  });

  it('rejects a body without an item id', async () => {
    const res = await request(buildTestApp().app).post('/api/ai/review').send({});

    expect(res.status).toBe(400);
    expect(ApiErrorSchema.parse(res.body).error.code).toBe('invalid_request');
  });
});
