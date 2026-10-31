import { formatTeachFallback } from '../../src/content/teachSteps';
import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import { fakeLlm, stallingLlm } from '../fakes/fakeLlm';
import { postSse, typesOf } from '../fakes/sse';
import { buildTestApp } from '../fakes/testApp';

const talk = (content: string) => ({ mode: 'talk', messages: [{ role: 'user', content }] });
const teach = (content: string) => ({ mode: 'teach', messages: [{ role: 'user', content }] });

describe('POST /api/ai/chat', () => {
  it('streams a talk reply as tokens, with the ranked queue injected server-side', async () => {
    const llm = fakeLlm(['Start with ', 'the safety specs.']);
    const { app, usage } = buildTestApp({ llm });

    const { res, events } = await postSse(app, '/api/ai/chat', talk('What should I review first?'));

    expect(res.status).toBe(200);
    expect(events).toEqual([
      { type: 'token', text: 'Start with ' },
      { type: 'token', text: 'the safety specs.' },
      { type: 'done' },
    ]);
    expect(llm.requests[0]?.system).toContain('rank 1 (high) [a3] "Safety Equipment & Sensor Specs"');
    expect(llm.requests[0]?.messages).toEqual([{ role: 'user', content: 'What should I review first?' }]);
    expect(usage).toMatchObject([{ promptId: 'talk', outcome: 'ok' }]);
  });

  it('uses the teach prompt, grounded in the policy, for teach mode', async () => {
    const llm = fakeLlm(['1. Check the deadline.']);
    const { app, usage } = buildTestApp({ llm });

    await postSse(app, '/api/ai/chat', teach('How do I review an approval?'));

    expect(llm.requests[0]?.system).toMatch(/numbered steps/i);
    expect(llm.requests[0]?.system).toContain('[safety-and-sensor-specifications]');
    expect(usage).toMatchObject([{ promptId: 'teach' }]);
  });

  it('keeps a multi-turn conversation in order', async () => {
    const llm = fakeLlm(['Sure.']);
    const { app } = buildTestApp({ llm });
    const messages = [
      { role: 'user', content: 'How do I review an approval?' },
      { role: 'assistant', content: '1. Check the deadline. Want the next step?' },
      { role: 'user', content: 'Yes, go on.' },
    ];

    await postSse(app, '/api/ai/chat', { mode: 'teach', messages });

    expect(llm.requests[0]?.messages).toEqual(messages);
  });

  it('falls back to the ranked queue for talk when the LLM is unavailable', async () => {
    const { app } = buildTestApp({ llm: new UnavailableLlmClient('no_api_key') });

    const { events } = await postSse(app, '/api/ai/chat', talk('What is urgent?'));

    expect(typesOf(events)).toEqual(['fallback', 'done']);
    const content = events[0]?.type === 'fallback' ? events[0].content : '';
    expect(content).toMatch(/^The assistant is unavailable right now\. Here's the current queue in priority order:/);
    expect(content).toMatch(/1\. Safety Equipment & Sensor Specs \(high\)/);
  });

  it('falls back to the static five-step guide for teach when the LLM is unavailable', async () => {
    const { app } = buildTestApp({ llm: new UnavailableLlmClient('forced') });

    const { events } = await postSse(app, '/api/ai/chat', teach('Teach me'));

    expect(events[0]).toEqual({ type: 'fallback', reason: 'forced', content: formatTeachFallback() });
  });

  it('keeps the partial reply and appends the fallback when the stream stalls', async () => {
    const { app } = buildTestApp({ llm: stallingLlm(['Start with the ']) });

    const { events } = await postSse(app, '/api/ai/chat', talk('What first?'));

    expect(typesOf(events)).toEqual(['token', 'fallback', 'done']);
    expect(events[1]).toMatchObject({ reason: 'timeout' });
  });
});
