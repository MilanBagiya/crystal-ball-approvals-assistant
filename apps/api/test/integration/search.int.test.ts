import { ApiErrorSchema, SearchResponseSchema } from '@approvals/contracts';
import request from 'supertest';
import { fakeLlm } from '../fakes/fakeLlm';
import { buildTestApp } from '../fakes/testApp';

describe('POST /api/ai/search', () => {
  it('returns a validated filter and the matching item ids', async () => {
    const { app, usage } = buildTestApp({ llm: fakeLlm([JSON.stringify({ types: ['image'] })]) });

    const res = await request(app).post('/api/ai/search').send({ query: 'show me the images' });

    expect(res.status).toBe(200);
    expect(SearchResponseSchema.parse(res.body)).toMatchObject({ source: 'ai', itemIds: ['a4'] });
    expect(usage).toMatchObject([{ promptId: 'search', promptVersion: '1.1.0', outcome: 'ok' }]);
  });

  it('rejects an empty query', async () => {
    const res = await request(buildTestApp().app).post('/api/ai/search').send({ query: '   ' });

    expect(res.status).toBe(400);
    expect(ApiErrorSchema.parse(res.body).error.code).toBe('invalid_request');
  });
});
