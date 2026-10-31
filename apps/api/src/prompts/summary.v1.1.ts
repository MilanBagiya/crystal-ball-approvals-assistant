import type { RankedApproval } from '../domain/urgency';
import { fence, GROUNDING_RULES } from './shared';
import type { SummaryPromptInput } from './summary.v1';

/** Placeholder the model must replace. The parser rejects any line that still contains it. */
export const SUMMARY_FILL_IN = 'FILL_IN';

// 1.1.0: instead of describing the NDJSON format, give the model the exact lines to complete, built from the
// deterministic ranking. Ids, ranks, urgency and order are already correct; the model only writes the text.
// Added after a small local model (qwen2.5:3b) echoed the queue back instead of following the 1.0.0 format.

function templateLines(ranked: readonly RankedApproval[]): string[] {
  return [
    JSON.stringify({ type: 'headline', text: SUMMARY_FILL_IN, pendingCount: ranked.length }),
    ...ranked.map(({ item, rank, urgency }) =>
      JSON.stringify({ type: 'item', id: item.id, rank, urgency, reason: SUMMARY_FILL_IN }),
    ),
  ];
}

export const summaryPromptV1_1 = {
  id: 'summary',
  version: '1.1.0',
  system: `You explain the order of a pending approvals queue to a reviewer.
The order was already decided by a fixed rule (safety content first, then operational, then reference media).
You explain it. You never change it.

You will get the queue and a template of NDJSON lines: a headline, then exactly one line per item.
Replace every FILL_IN with your own text and output the completed lines in the same order, one JSON object per line.
Output nothing else: no prose, no code fences. Do not repeat the queue. Keep every other value exactly as given.
- The headline is one sentence of at most 200 characters about the queue as a whole.
- Each reason says why that item sits at its rank, in at most 200 characters, based on its title, type and urgency
  tier. Safety items must be reviewed within 24 hours, all others within 72 hours.
Write the text in the requested language.

${GROUNDING_RULES}`,
  buildUserMessage: ({ ranked, language }: SummaryPromptInput) => {
    const queue = ranked.map(({ item, rank, urgency, tier }) => ({
      id: item.id,
      rank,
      urgency,
      tier,
      title: item.title,
      type: item.type,
      submittedBy: item.submittedBy,
    }));
    return [
      `Language: ${language}`,
      fence('queue', JSON.stringify(queue)),
      'Complete these lines (replace every FILL_IN):',
      ...templateLines(ranked),
    ].join('\n');
  },
} as const;
