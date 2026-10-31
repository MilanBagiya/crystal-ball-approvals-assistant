import request from 'supertest';
import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import { postSse, typesOf } from '../fakes/sse';
import { buildTestApp } from '../fakes/testApp';

// The whole app with no API key: every AI action must still answer 200 with a usable, non-AI response.

const { app, usage } = buildTestApp({ llm: new UnavailableLlmClient('no_api_key') });

const streams: [string, string, object][] = [
  ['summary', '/api/ai/summary', {}],
  ['help', '/api/ai/help', { question: 'What is the review SLA for safety documents?' }],
  ['talk', '/api/ai/chat', { mode: 'talk', messages: [{ role: 'user', content: 'What is urgent?' }] }],
  ['teach', '/api/ai/chat', { mode: 'teach', messages: [{ role: 'user', content: 'Teach me' }] }],
];

describe('with no API key', () => {
  it('health reports the LLM as not configured', async () => {
    expect((await request(app).get('/api/health')).body).toEqual({ ok: true, llm: 'not_configured' });
  });

  it('greeting returns the template', async () => {
    const res = await request(app).post('/api/ai/greeting').send({ localTime: '10:00' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      greeting: 'Good morning! You have 4 items waiting for review, including 1 safety document.',
      source: 'template',
    });
  });

  it.each(streams)('%s streams a no_api_key fallback with real content, then done', async (_name, path, body) => {
    const { res, events } = await postSse(app, path, body);

    expect(res.status).toBe(200);
    const fallback = events.find((e) => e.type === 'fallback');
    expect(fallback).toMatchObject({ reason: 'no_api_key' });
    expect(fallback?.type === 'fallback' && fallback.content.length).toBeGreaterThan(50);
    expect(typesOf(events).at(-1)).toBe('done');
  });

  it('logs every attempted LLM call as unavailable', () => {
    expect(usage.length).toBeGreaterThanOrEqual(5);
    expect(usage.every((u) => u.outcome === 'unavailable')).toBe(true);
  });
});
