import type { RankedApproval } from '../domain/urgency';
import { fence, GROUNDING_RULES } from './shared';

export interface SummaryPromptInput {
  ranked: readonly RankedApproval[];
  language: string;
}

export const summaryPromptV1 = {
  id: 'summary',
  version: '1.0.0',
  system: `You explain the order of a pending approvals queue to a reviewer.
The order was already decided by a fixed rule (safety content first, then operational, then reference media).
You explain it. You never change it.

Output NDJSON: one JSON object per line and nothing else. No prose, no code fences.
Line 1: {"type":"headline","text":"<one sentence, at most 200 characters>","pendingCount":<pendingCount>}
Then exactly one line per item, in the given rank order:
{"type":"item","id":"<id>","rank":<rank>,"urgency":"<urgency>","reason":"<why it sits at this rank, at most 200 characters>"}
Copy id, rank, urgency and pendingCount exactly as given.
Base each reason on the item's title, type and urgency tier. Safety items must be reviewed within 24 hours, all others within 72 hours.
Write the text in the requested language.

${GROUNDING_RULES}`,
  buildUserMessage: ({ ranked, language }: SummaryPromptInput) => {
    const queue = {
      pendingCount: ranked.length,
      items: ranked.map(({ item, rank, urgency, tier }) => ({
        id: item.id,
        rank,
        urgency,
        tier,
        title: item.title,
        type: item.type,
        submittedBy: item.submittedBy,
        submittedAt: item.submittedAt,
      })),
    };
    return `Language: ${language}\n${fence('queue', JSON.stringify(queue))}`;
  },
} as const;
