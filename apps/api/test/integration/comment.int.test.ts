import { ApiErrorSchema, CommentDraftResponseSchema } from '@approvals/contracts';
import request from 'supertest';
import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import { fakeLlm } from '../fakes/fakeLlm';
import { buildTestApp } from '../fakes/testApp';

const body = { itemId: 'a2', decision: 'request_changes', notes: 'Faces are visible.' };

describe('POST /api/ai/comment', () => {
  it('returns a validated AI draft', async () => {
    const comment = 'Hi Alex, please blur the visible faces before resubmitting.';
    const { app, usage } = buildTestApp({ llm: fakeLlm([JSON.stringify({ comment })]) });

    const res = await request(app).post('/api/ai/comment').send(body);

    expect(res.status).toBe(200);
    expect(CommentDraftResponseSchema.parse(res.body)).toEqual({ comment, source: 'ai' });
    expect(usage).toMatchObject([{ promptId: 'comment', promptVersion: '1.0.0', outcome: 'ok' }]);
  });

  it('answers 200 with the template when there is no API key', async () => {
    const { app } = buildTestApp({ llm: new UnavailableLlmClient('no_api_key') });

    const res = await request(app).post('/api/ai/comment').send(body);

    expect(res.status).toBe(200);
    expect(CommentDraftResponseSchema.parse(res.body)).toMatchObject({ source: 'template', comment: /^Hi Alex,/ });
  });

  it('only drafts comments for request changes or reject', async () => {
    const res = await request(buildTestApp().app)
      .post('/api/ai/comment')
      .send({ ...body, decision: 'approve' });

    expect(res.status).toBe(400);
    expect(ApiErrorSchema.parse(res.body).error.code).toBe('invalid_request');
  });

  it('returns 404 for an unknown item', async () => {
    const res = await request(buildTestApp().app)
      .post('/api/ai/comment')
      .send({ ...body, itemId: 'zz' });

    expect(res.status).toBe(404);
  });
});
