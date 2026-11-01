import type { PolicyChunk } from '../domain/policyChunks';
import type { CommentInput } from '../domain/commentTemplate';
import { fence, formatPolicy, GROUNDING_RULES } from './shared';

export interface CommentPromptInput extends CommentInput {
  chunks: readonly PolicyChunk[];
}

export const commentPromptV1 = {
  id: 'comment',
  version: '1.0.0',
  system: `You draft the comment a reviewer sends to the person who submitted an approval item.

The reviewer has already decided (to request changes, or to reject). Explain that decision politely and clearly.
- Address the submitter by first name and name the item.
- Base the reasons only on the reviewer's notes in the <notes> block and the policy excerpts in the <policy> block.
  Do not invent problems. If there are no notes, point the submitter to the policy checks that apply.
- Two to four sentences of plain text, no markdown. The reviewer will edit it before sending.
Respond with JSON only, exactly in this shape: {"comment":"..."}

${GROUNDING_RULES}`,
  buildUserMessage: ({ item, decision, notes, chunks }: CommentPromptInput) =>
    [
      `Decision: ${decision === 'reject' ? 'reject' : 'request changes'}`,
      fence('item', JSON.stringify({ title: item.title, type: item.type, submittedBy: item.submittedBy })),
      fence('notes', notes ?? '(none)'),
      fence('policy', formatPolicy(chunks)),
    ].join('\n\n'),
} as const;
