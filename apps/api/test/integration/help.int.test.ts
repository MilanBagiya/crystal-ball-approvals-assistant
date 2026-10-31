import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import { fakeLlm } from '../fakes/fakeLlm';
import { postSse, typesOf } from '../fakes/sse';
import { buildTestApp } from '../fakes/testApp';

describe('POST /api/ai/help', () => {
  it('streams sources, then tokens, then done', async () => {
    const { app, usage } = buildTestApp({ llm: fakeLlm(['Within ', '24 hours [review-slas].']) });

    const { res, events } = await postSse(app, '/api/ai/help', {
      question: 'What is the review SLA for safety documents?',
    });

    expect(res.status).toBe(200);
    expect(typesOf(events)).toEqual(['sources', 'token', 'token', 'done']);
    expect(events[0]).toMatchObject({ chunkIds: expect.arrayContaining(['review-slas']) });
    expect(usage).toMatchObject([{ promptId: 'help', outcome: 'ok' }]);
  });

  it('falls back to the policy chunk text when the LLM is unavailable', async () => {
    const { app } = buildTestApp({ llm: new UnavailableLlmClient('forced') });

    const { events } = await postSse(app, '/api/ai/help', { question: 'Who do I escalate an expired calibration to?' });

    expect(typesOf(events)).toEqual(['sources', 'fallback', 'done']);
    expect(events[1]).toMatchObject({ reason: 'forced', content: expect.stringContaining('From the policy:') });
  });

  it('answers an off-topic question without calling the LLM', async () => {
    const llm = fakeLlm(['unused']);
    const { app, usage } = buildTestApp({ llm });

    const { events } = await postSse(app, '/api/ai/help', { question: 'Write me a poem about cats' });

    expect(typesOf(events)).toEqual(['token', 'done']);
    expect(llm.requests).toHaveLength(0);
    expect(usage).toHaveLength(0);
  });
});
