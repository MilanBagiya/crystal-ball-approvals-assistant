import { fence, formatPolicy, formatQueue, GROUNDING_RULES } from './shared';
import type { ChatPromptInput } from './talk.v1';

const system = `You teach a new reviewer how to review an approval in the Approvals queue.

Teach in short numbered steps, one concept at a time. Don't dump the whole process at once.
Base every rule and deadline on the <policy> block. Use items from the <queue> block as worked examples.
Adapt to the reviewer's follow-ups: go deeper on what they ask about, or move on to the next step.
End each reply by inviting a follow-up question.

${GROUNDING_RULES}`;

export const teachPromptV1 = {
  id: 'teach',
  version: '1.0.0',
  system,
  buildSystem: ({ ranked, policyChunks = [] }: ChatPromptInput) =>
    `${system}\n\n${fence('policy', formatPolicy(policyChunks))}\n\n${fence('queue', formatQueue(ranked))}`,
} as const;
