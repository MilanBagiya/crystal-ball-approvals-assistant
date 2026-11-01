import { BriefingResponseSchema, DashboardSchema } from '@approvals/contracts';
import request from 'supertest';
import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import { fakeLlm } from '../fakes/fakeLlm';
import { buildTestApp } from '../fakes/testApp';

const now = () => new Date('2026-09-19T12:00:00.000Z');

describe('GET /api/dashboard', () => {
  it('returns validated metrics for the live queue, including decisions made since startup', async () => {
    const { app } = buildTestApp({ now });
    await request(app).post('/api/approvals/a3/decision').send({ decision: 'approve' });

    const res = await request(app).get('/api/dashboard');

    expect(res.status).toBe(200);
    const dashboard = DashboardSchema.parse(res.body);
    expect(dashboard.counts).toMatchObject({ pending_review: 3, approved: 1 });
    expect(dashboard.deadlines.map((d) => d.id)).not.toContain('a3');
    expect(dashboard.recentDecisions.map((i) => i.id)).toEqual(['a3']);
  });
});

describe('POST /api/ai/briefing', () => {
  it('returns the AI briefing', async () => {
    const briefing = '4 items are waiting, 1 overdue by 12 hours: start with the safety specs.';
    const { app, usage } = buildTestApp({ now, llm: fakeLlm([JSON.stringify({ briefing })]) });

    const res = await request(app).post('/api/ai/briefing').send({});

    expect(BriefingResponseSchema.parse(res.body)).toEqual({ briefing, source: 'ai' });
    expect(usage).toMatchObject([{ promptId: 'briefing', promptVersion: '1.0.0', outcome: 'ok' }]);
  });

  it('answers 200 with the template when there is no API key', async () => {
    const { app } = buildTestApp({ now, llm: new UnavailableLlmClient('no_api_key') });

    const res = await request(app).post('/api/ai/briefing').send({});

    expect(res.status).toBe(200);
    expect(BriefingResponseSchema.parse(res.body).source).toBe('template');
  });
});

describe('POST /api/approvals/reset', () => {
  it('puts every item back to pending, so a demo can start over', async () => {
    const { app } = buildTestApp({ now });
    await request(app).post('/api/approvals/a1/decision').send({ decision: 'approve' });

    const res = await request(app).post('/api/approvals/reset');

    expect(res.status).toBe(200);
    const after = DashboardSchema.parse((await request(app).get('/api/dashboard')).body);
    expect(after.counts.pending_review).toBe(4);
  });
});
