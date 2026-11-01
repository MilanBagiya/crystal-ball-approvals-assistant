import { ApiErrorSchema, ApprovalsResponseSchema, DecisionResponseSchema } from '@approvals/contracts';
import request from 'supertest';
import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import { seedApprovals } from '../fixtures/approvals';
import { postSse } from '../fakes/sse';
import { buildTestApp } from '../fakes/testApp';

// Decisions don't need the LLM; the unavailable client also makes greeting and summary deterministic to assert on.
const appWithoutLlm = () => buildTestApp({ llm: new UnavailableLlmClient('no_api_key') }).app;
const decide = (app: ReturnType<typeof appWithoutLlm>, id: string, body: object) =>
  request(app).post(`/api/approvals/${id}/decision`).send(body);

describe('POST /api/approvals/:id/decision', () => {
  it('approves an item and records when', async () => {
    const app = appWithoutLlm();

    const res = await decide(app, 'a3', { decision: 'approve' });

    expect(res.status).toBe(200);
    const { item } = DecisionResponseSchema.parse(res.body);
    expect(item).toMatchObject({ id: 'a3', status: 'approved' });
    expect(Date.parse(item.reviewedAt ?? '')).not.toBeNaN();
  });

  it('keeps the decision: the queue shows the new status afterwards', async () => {
    const app = appWithoutLlm();
    await decide(app, 'a3', { decision: 'approve' });

    const { items } = ApprovalsResponseSchema.parse((await request(app).get('/api/approvals')).body);

    expect(items.find((i) => i.id === 'a3')?.status).toBe('approved');
    expect(items.filter((i) => i.status === 'pending_review')).toHaveLength(3);
  });

  it.each([
    ['request_changes', 'changes_requested'],
    ['reject', 'rejected'],
  ])('records a %s decision with the reviewer comment', async (decision, status) => {
    const app = appWithoutLlm();

    const res = await decide(app, 'a2', { decision, comment: 'Faces at 0:42 are not blurred.' });

    expect(DecisionResponseSchema.parse(res.body).item).toMatchObject({
      status,
      reviewComment: 'Faces at 0:42 are not blurred.',
    });
  });

  it('requires a comment to request changes or reject, so the submitter knows why', async () => {
    const res = await decide(appWithoutLlm(), 'a2', { decision: 'reject' });

    expect(res.status).toBe(400);
    expect(ApiErrorSchema.parse(res.body).error).toMatchObject({ code: 'invalid_request', message: /comment/ });
  });

  it('returns 404 in the error shape for an unknown item', async () => {
    const res = await decide(appWithoutLlm(), 'zz', { decision: 'approve' });

    expect(res.status).toBe(404);
    expect(ApiErrorSchema.parse(res.body).error.code).toBe('not_found');
  });

  it('returns 409 when the item was already decided', async () => {
    const app = appWithoutLlm();
    await decide(app, 'a1', { decision: 'approve' });

    const res = await decide(app, 'a1', { decision: 'reject', comment: 'Changed my mind.' });

    expect(res.status).toBe(409);
    expect(ApiErrorSchema.parse(res.body).error.code).toBe('already_decided');
  });

  it('never changes the seed data itself (a fresh app starts from the full queue)', async () => {
    await decide(appWithoutLlm(), 'a1', { decision: 'approve' });

    expect(seedApprovals().every((i) => i.status === 'pending_review')).toBe(true);
    const { items } = ApprovalsResponseSchema.parse((await request(appWithoutLlm()).get('/api/approvals')).body);
    expect(items.every((i) => i.status === 'pending_review')).toBe(true);
  });
});

describe('decisions flow into the assistant', () => {
  it('the greeting counts only what is still pending', async () => {
    const app = appWithoutLlm();
    await decide(app, 'a3', { decision: 'approve' });

    const res = await request(app).post('/api/ai/greeting').send({ localTime: '09:00' });

    // a3 was the only safety item, so the safety clause disappears too.
    expect(res.body).toEqual({ greeting: 'Good morning! You have 3 items waiting for review.', source: 'template' });
  });

  it('the summary leaves decided items out', async () => {
    const app = appWithoutLlm();
    await decide(app, 'a3', { decision: 'approve' });

    const { events } = await postSse(app, '/api/ai/summary', {});

    const ids = events.flatMap((e) => (e.type === 'summary_item' ? [e.id] : []));
    expect(ids).toEqual(['a2', 'a1', 'a4']);
  });
});
