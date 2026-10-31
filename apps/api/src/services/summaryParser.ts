import {
  SummaryHeadlineSchema,
  SummaryItemSchema,
  type FallbackReason,
  type StreamEvent,
  type SummaryHeadline,
  type SummaryItem,
} from '@approvals/contracts';
import { z } from 'zod';
import { fallbackHeadline, fallbackReason, formatRankedQueue } from '../domain/summaryFallback';
import type { RankedApproval } from '../domain/urgency';
import { toFallbackReason } from '../llm/errors';
import { SUMMARY_FILL_IN } from '../prompts/summary.v1.1';

// Streaming + structured output at once: the model writes NDJSON, and each line is parsed, validated and
// emitted as soon as it is complete. The model explains the deterministic order; it can never change it.

export type RejectionReason =
  'invalid_json' | 'schema' | 'unfilled' | 'unknown_id' | 'duplicate' | 'wrong_rank' | 'wrong_urgency' | 'wrong_count';

export interface Rejection {
  reason: RejectionReason;
  line: string;
}

const SummaryLineSchema = z.discriminatedUnion('type', [SummaryHeadlineSchema, SummaryItemSchema]);

type LineResult =
  | { kind: 'headline'; headline: SummaryHeadline }
  | { kind: 'item'; item: SummaryItem }
  | { kind: 'rejected'; rejection: Rejection }
  | { kind: 'skip' };

/** Validates one NDJSON line against the schema and the deterministic ranking. Stateful: tracks what was accepted. */
function createLineValidator(ranked: readonly RankedApproval[]) {
  const byId = new Map(ranked.map((r) => [r.item.id, r]));
  const acceptedIds = new Set<string>();
  let headlineAccepted = false;

  const reject = (reason: RejectionReason, line: string): LineResult => ({
    kind: 'rejected',
    rejection: { reason, line: line.slice(0, 200) },
  });

  return function validate(rawLine: string): LineResult {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('```')) return { kind: 'skip' }; // formatting noise, not content

    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      return reject('invalid_json', line);
    }
    const parsed = SummaryLineSchema.safeParse(json);
    if (!parsed.success) return reject('schema', line);
    // A template line the model copied without writing its own text explains nothing.
    const text = parsed.data.type === 'headline' ? parsed.data.text : parsed.data.reason;
    if (text.includes(SUMMARY_FILL_IN)) return reject('unfilled', line);

    if (parsed.data.type === 'headline') {
      if (headlineAccepted) return reject('duplicate', line);
      if (parsed.data.pendingCount !== ranked.length) return reject('wrong_count', line);
      headlineAccepted = true;
      return { kind: 'headline', headline: parsed.data };
    }

    const item = parsed.data;
    const expected = byId.get(item.id);
    if (!expected) return reject('unknown_id', line);
    if (acceptedIds.has(item.id)) return reject('duplicate', line);
    if (item.rank !== expected.rank) return reject('wrong_rank', line);
    if (item.urgency !== expected.urgency) return reject('wrong_urgency', line);
    acceptedIds.add(item.id);
    return { kind: 'item', item };
  };
}

/** Buffers chunks and returns only complete lines; `flush` returns whatever is left at the end. */
function createLineSplitter() {
  let buffer = '';
  return {
    push(chunk: string): string[] {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      return lines;
    },
    flush(): string[] {
      const rest = buffer;
      buffer = '';
      return rest ? [rest] : [];
    },
  };
}

const headlineEvent = (headline: SummaryHeadline, source: 'ai' | 'fallback'): StreamEvent => ({
  type: 'summary_headline',
  text: headline.text,
  pendingCount: headline.pendingCount,
  source,
});

const itemEvent = (item: Omit<SummaryItem, 'type'>, source: 'ai' | 'fallback'): StreamEvent => ({
  type: 'summary_item',
  id: item.id,
  rank: item.rank,
  urgency: item.urgency,
  reason: item.reason,
  source,
});

const fallbackItem = (r: RankedApproval) =>
  itemEvent({ id: r.item.id, rank: r.rank, urgency: r.urgency, reason: fallbackReason(r) }, 'fallback');

export async function* summaryEvents(
  modelChunks: AsyncIterable<string>,
  ranked: readonly RankedApproval[],
  onReject: (rejection: Rejection) => void,
): AsyncGenerator<StreamEvent, void, undefined> {
  const validate = createLineValidator(ranked);
  const splitter = createLineSplitter();
  const sentIds = new Set<string>();
  let headlineSent = false;
  let failure: FallbackReason | undefined;

  function* handle(lines: string[]): Generator<StreamEvent> {
    for (const line of lines) {
      const result = validate(line);
      if (result.kind === 'headline') {
        headlineSent = true;
        yield headlineEvent(result.headline, 'ai');
      } else if (result.kind === 'item') {
        sentIds.add(result.item.id);
        yield itemEvent(result.item, 'ai');
      } else if (result.kind === 'rejected') {
        onReject(result.rejection);
      }
    }
  }

  try {
    for await (const chunk of modelChunks) yield* handle(splitter.push(chunk));
    yield* handle(splitter.flush());
  } catch (error) {
    // Timeout or model error mid-stream: keep what was already sent, fill in the rest below.
    failure = toFallbackReason(error);
  }

  const reason = failure ?? 'invalid_output';
  const missing = ranked.filter((r) => !sentIds.has(r.item.id));
  const headline = fallbackHeadline(ranked);

  if (!headlineSent && sentIds.size === 0) {
    // Nothing usable from the model: a complete deterministic summary, as text and as structured parts.
    yield { type: 'fallback', reason, content: `${headline.text}\n\n${formatRankedQueue(ranked)}` };
    yield headlineEvent(headline, 'fallback');
    for (const r of ranked) yield fallbackItem(r);
    return;
  }

  if (missing.length === 0 && headlineSent) return;

  const filled =
    missing.length > 0
      ? `${missing.length} of ${ranked.length} items were filled in from the standard ranking.`
      : 'The headline was filled in from the standard ranking.';
  yield { type: 'fallback', reason, content: filled };
  if (!headlineSent) yield headlineEvent(headline, 'fallback');
  for (const r of missing) yield fallbackItem(r);
}
