import { failingLlm, fakeLlm, hangingLlm } from '../fakes/fakeLlm';
import { postSse, typesOf } from '../fakes/sse';
import { buildTestApp } from '../fakes/testApp';

const lines = [
  { type: 'headline', text: 'Four items wait; the safety specs come first.', pendingCount: 4 },
  { type: 'item', id: 'a3', rank: 1, urgency: 'high', reason: 'Safety specs: 24h SLA.' },
  { type: 'item', id: 'a2', rank: 2, urgency: 'medium', reason: 'Patrol demo supports operations.' },
  { type: 'item', id: 'a1', rank: 3, urgency: 'medium', reason: 'Onboarding checklists for patrols.' },
  { type: 'item', id: 'a4', rank: 4, urgency: 'low', reason: 'Reference layout map.' },
]
  .map((l) => JSON.stringify(l))
  .join('\n');

// Chunk boundaries that cut through JSON objects, as a real token stream does.
const chunked = (text: string, size: number) => text.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g')) ?? [];

describe('POST /api/ai/summary', () => {
  it('streams the headline, then four validated items, then done', async () => {
    const { app, usage } = buildTestApp({ llm: fakeLlm(chunked(lines, 7)) });

    const { res, events } = await postSse(app, '/api/ai/summary', {});

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/event-stream/);
    expect(typesOf(events)).toEqual([
      'summary_headline',
      'summary_item',
      'summary_item',
      'summary_item',
      'summary_item',
      'done',
    ]);
    expect(events.every((e) => !('source' in e) || e.source === 'ai')).toBe(true);
    expect(usage).toMatchObject([{ promptId: 'summary', outcome: 'ok' }]);
  });

  it('answers 200 with a timeout fallback, never a 500, when the model never responds', async () => {
    const { app, usage } = buildTestApp({ llm: hangingLlm() });

    const { res, events } = await postSse(app, '/api/ai/summary', {});

    expect(res.status).toBe(200);
    expect(events[0]).toMatchObject({ type: 'fallback', reason: 'timeout' });
    expect(events.filter((e) => e.type === 'summary_item')).toHaveLength(4);
    expect(typesOf(events).at(-1)).toBe('done');
    expect(usage).toMatchObject([{ outcome: 'timeout' }]);
  });

  it('falls back with reason invalid_output when the model returns garbage, and logs each rejected line', async () => {
    const { app, logs } = buildTestApp({ llm: fakeLlm(['Here is your summary!\n', '* item one\n* item two']) });

    const { events } = await postSse(app, '/api/ai/summary', {});

    expect(events[0]).toMatchObject({ type: 'fallback', reason: 'invalid_output' });
    expect(typesOf(events).at(-1)).toBe('done');
    expect(logs.filter((l) => l.event === 'summary_line_rejected')).toHaveLength(3);
  });

  it('keeps streamed items and fills the rest when the model fails midway', async () => {
    const firstTwoLines = lines.split('\n').slice(0, 2).join('\n') + '\n';
    const { app } = buildTestApp({ llm: failingLlm(new Error('connection reset'), [firstTwoLines]) });

    const { events } = await postSse(app, '/api/ai/summary', {});

    expect(events.filter((e) => e.type === 'summary_item').map((e) => 'source' in e && e.source)).toEqual([
      'ai',
      'fallback',
      'fallback',
      'fallback',
    ]);
    expect(events.find((e) => e.type === 'fallback')).toMatchObject({ reason: 'llm_error' });
  });

  it('ends every stream with exactly one done', async () => {
    const { app } = buildTestApp({ llm: fakeLlm([lines]) });

    const { events } = await postSse(app, '/api/ai/summary', {});

    expect(events.filter((e) => e.type === 'done')).toHaveLength(1);
  });
});
