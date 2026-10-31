import type { StreamEvent, SummaryItemEvent } from '@approvals/contracts';
import { rankApprovals } from '../../src/domain/urgency';
import { LlmError } from '../../src/llm/errors';
import { summaryEvents, type Rejection } from '../../src/services/summaryParser';
import { seedApprovals } from '../fixtures/approvals';

const ranked = rankApprovals(seedApprovals()); // a3, a2, a1, a4

const headline = { type: 'headline', text: 'Four items are waiting; start with the safety specs.', pendingCount: 4 };
const item = (id: string, rank: number, urgency: string, reason = `Reason for ${id}.`) => ({
  type: 'item',
  id,
  rank,
  urgency,
  reason,
});
const VALID = [headline, item('a3', 1, 'high'), item('a2', 2, 'medium'), item('a1', 3, 'medium'), item('a4', 4, 'low')];
const ndjson = (lines: readonly unknown[]) =>
  lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n');

async function* source(chunks: readonly string[], failWith?: Error): AsyncGenerator<string> {
  yield* chunks;
  if (failWith) throw failWith;
}

async function run(chunks: readonly string[], failWith?: Error) {
  const rejections: Rejection[] = [];
  const events: StreamEvent[] = [];
  for await (const event of summaryEvents(source(chunks, failWith), ranked, (r) => rejections.push(r))) {
    events.push(event);
  }
  return { events, rejections };
}

const items = (events: StreamEvent[]) => events.filter((e): e is SummaryItemEvent => e.type === 'summary_item');
const summarise = (events: StreamEvent[]) =>
  events.map((e) =>
    e.type === 'summary_item'
      ? `item:${e.id}:${e.source}`
      : e.type === 'summary_headline'
        ? `headline:${e.source}`
        : e.type,
  );

describe('summaryEvents: valid output', () => {
  it('turns valid NDJSON lines into validated events, in order', async () => {
    const { events, rejections } = await run([ndjson(VALID) + '\n']);

    expect(summarise(events)).toEqual(['headline:ai', 'item:a3:ai', 'item:a2:ai', 'item:a1:ai', 'item:a4:ai']);
    expect(events[0]).toEqual({ type: 'summary_headline', text: headline.text, pendingCount: 4, source: 'ai' });
    expect(items(events)[0]).toEqual({
      type: 'summary_item',
      id: 'a3',
      rank: 1,
      urgency: 'high',
      reason: 'Reason for a3.',
      source: 'ai',
    });
    expect(rejections).toEqual([]);
  });

  it('joins a line split across chunks, even one character at a time', async () => {
    const { events } = await run([...ndjson(VALID)]);

    expect(summarise(events)).toEqual(['headline:ai', 'item:a3:ai', 'item:a2:ai', 'item:a1:ai', 'item:a4:ai']);
  });

  it('parses a final line that has no trailing newline', async () => {
    const { events } = await run([ndjson(VALID)]);

    expect(items(events).at(-1)).toMatchObject({ id: 'a4', source: 'ai' });
  });

  it('emits each item as soon as its line is complete, before the stream ends', async () => {
    const seen: string[] = [];
    async function* slow(): AsyncGenerator<string> {
      yield JSON.stringify(headline) + '\n' + JSON.stringify(VALID[1]) + '\n';
      seen.push('model still streaming');
      yield ndjson(VALID.slice(2));
    }

    for await (const event of summaryEvents(slow(), ranked, () => undefined)) {
      seen.push(event.type === 'summary_item' ? event.id : event.type);
    }

    expect(seen.slice(0, 3)).toEqual(['summary_headline', 'a3', 'model still streaming']);
  });

  it('ignores blank lines and markdown code fences without counting them as rejections', async () => {
    const { events, rejections } = await run([['```json', '', ndjson(VALID), '```'].join('\n')]);

    expect(items(events).every((e) => e.source === 'ai')).toBe(true);
    expect(rejections).toEqual([]);
  });
});

describe('summaryEvents: rejected lines', () => {
  it.each([
    ['an unknown item id', item('a9', 1, 'high'), 'unknown_id'],
    ['a rank that differs from the deterministic rank', item('a3', 2, 'high'), 'wrong_rank'],
    ['an urgency that differs from the deterministic one', item('a3', 1, 'low'), 'wrong_urgency'],
    ['a schema violation', item('a3', 1, 'critical'), 'schema'],
    ['a reason over 240 characters', item('a3', 1, 'high', 'x'.repeat(241)), 'schema'],
    ['broken JSON', '{"type":"item","id":"a3",', 'invalid_json'],
  ])('drops %s and fills that item in deterministically', async (_label, badLine, reason) => {
    const lines = [headline, badLine, ...VALID.slice(2)];

    const { events, rejections } = await run([ndjson(lines)]);

    expect(rejections).toEqual([expect.objectContaining({ reason })]);
    const a3 = items(events).find((e) => e.id === 'a3');
    expect(a3).toMatchObject({ rank: 1, urgency: 'high', source: 'fallback' });
    expect(items(events)).toHaveLength(4);
  });

  it('drops a duplicate item and keeps the first one', async () => {
    const lines = [...VALID.slice(0, 2), item('a3', 1, 'high', 'Second copy.'), ...VALID.slice(2)];

    const { events, rejections } = await run([ndjson(lines)]);

    expect(rejections).toEqual([expect.objectContaining({ reason: 'duplicate' })]);
    expect(items(events).filter((e) => e.id === 'a3')).toEqual([expect.objectContaining({ reason: 'Reason for a3.' })]);
  });

  it('drops a headline with the wrong pending count and sends the deterministic headline instead', async () => {
    const { events, rejections } = await run([ndjson([{ ...headline, pendingCount: 7 }, ...VALID.slice(1)])]);

    expect(rejections).toEqual([expect.objectContaining({ reason: 'wrong_count' })]);
    expect(events.find((e) => e.type === 'summary_headline')).toMatchObject({ pendingCount: 4, source: 'fallback' });
  });
});

describe('summaryEvents: fallbacks', () => {
  it('gives every item missing from the model output a deterministic fallback, in rank order', async () => {
    const { events } = await run([ndjson([headline, item('a2', 2, 'medium')])]);

    expect(summarise(events)).toEqual([
      'headline:ai',
      'item:a2:ai',
      'fallback',
      'item:a3:fallback',
      'item:a1:fallback',
      'item:a4:fallback',
    ]);
    expect(events.find((e) => e.type === 'fallback')).toMatchObject({ reason: 'invalid_output' });
    expect(items(events).find((e) => e.id === 'a3')?.reason).toMatch(/24 hours/);
  });

  it('returns a full fallback summary when every line is invalid', async () => {
    const { events, rejections } = await run(['Sure! Here is your summary:\n', 'not json at all\n']);

    expect(rejections).toHaveLength(2);
    expect(summarise(events)).toEqual([
      'fallback',
      'headline:fallback',
      'item:a3:fallback',
      'item:a2:fallback',
      'item:a1:fallback',
      'item:a4:fallback',
    ]);
    const fallback = events[0];
    expect(fallback).toMatchObject({ type: 'fallback', reason: 'invalid_output' });
    // The text fallback lists the queue in priority order, starting with the safety item.
    expect(fallback?.type === 'fallback' && fallback.content).toMatch(/1\. Safety Equipment & Sensor Specs \(high\)/);
  });

  it('keeps items that arrived before a mid-stream timeout and reports the timeout as the reason', async () => {
    const { events } = await run([ndjson(VALID.slice(0, 2)) + '\n'], new LlmError('timeout', 'idle timeout'));

    expect(summarise(events)).toEqual([
      'headline:ai',
      'item:a3:ai',
      'fallback',
      'item:a2:fallback',
      'item:a1:fallback',
      'item:a4:fallback',
    ]);
    expect(events.find((e) => e.type === 'fallback')).toMatchObject({ reason: 'timeout' });
  });

  it('reports no_api_key as the reason when the model is unavailable', async () => {
    const { events } = await run([], new LlmError('unavailable', 'no key', { unavailableReason: 'no_api_key' }));

    expect(events[0]).toMatchObject({ type: 'fallback', reason: 'no_api_key' });
    expect(items(events)).toHaveLength(4);
  });
});
