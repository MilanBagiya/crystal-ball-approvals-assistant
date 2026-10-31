import { GreetingResponseSchema } from '@approvals/contracts';
import request from 'supertest';
import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import { fakeLlm, hangingLlm } from '../fakes/fakeLlm';
import { buildTestApp } from '../fakes/testApp';

describe('POST /api/ai/greeting', () => {
  it('returns the AI greeting as validated JSON', async () => {
    const { app, usage } = buildTestApp({ llm: fakeLlm(['{"greeting":"Good morning! 4 items await you."}']) });

    const res = await request(app).post('/api/ai/greeting').send({ localTime: '09:30' });

    expect(res.status).toBe(200);
    expect(GreetingResponseSchema.parse(res.body)).toEqual({
      greeting: 'Good morning! 4 items await you.',
      source: 'ai',
    });
    expect(usage).toMatchObject([{ promptId: 'greeting', promptVersion: '1.2.0', outcome: 'ok' }]);
  });

  it('still answers 200 with the template when the model times out', async () => {
    const { app } = buildTestApp({ llm: hangingLlm() });

    const res = await request(app).post('/api/ai/greeting').send({ localTime: '19:00' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      greeting: 'Good evening! You have 4 items waiting for review, including 1 safety document.',
      source: 'template',
    });
  });

  it('works with an empty body (all fields are optional)', async () => {
    const { app } = buildTestApp({ llm: new UnavailableLlmClient('no_api_key') });

    const res = await request(app).post('/api/ai/greeting');

    expect(res.status).toBe(200);
    expect(res.body.greeting).toMatch(/^Hello! You have 4 items/);
  });
});
