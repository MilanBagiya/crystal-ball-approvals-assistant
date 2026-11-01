import type { ApprovalItem } from '@approvals/contracts';
import type { PolicyChunk } from '../domain/policyChunks';
import { fence, formatPolicy, GROUNDING_RULES } from './shared';

export interface ReviewPromptInput {
  item: ApprovalItem;
  chunks: readonly PolicyChunk[];
}

export const reviewPromptV1 = {
  id: 'review',
  version: '1.0.0',
  system: `You prepare a review checklist for one item in the approvals queue, for the reviewer to work through.

Write 3 to 6 checks specific to this item, based only on the policy excerpts provided in the <policy> block.
Each check says what to verify (at most 160 characters), why the policy requires it (at most 200 characters), and the
id of the excerpt it comes from, e.g. "content-checks-by-type".
You only see the item's metadata, not the file itself, so do not decide whether to approve or reject it, and do not
claim that any check passes or fails.
Respond with JSON only, exactly in this shape:
{"checks":[{"check":"...","why":"...","chunkId":"..."}]}

${GROUNDING_RULES}`,
  buildUserMessage: ({ item, chunks }: ReviewPromptInput) =>
    [
      fence(
        'item',
        JSON.stringify({ title: item.title, type: item.type, path: item.path, submittedBy: item.submittedBy }),
      ),
      fence('policy', formatPolicy(chunks)),
    ].join('\n\n'),
} as const;
