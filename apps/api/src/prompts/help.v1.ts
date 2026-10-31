import type { PolicyChunk } from '../domain/policyChunks';
import { fence, formatPolicy, GROUNDING_RULES } from './shared';

export interface HelpPromptInput {
  question: string;
  chunks: readonly PolicyChunk[];
}

export const NOT_COVERED = "The policy doesn't cover this.";

export const helpPromptV1 = {
  id: 'help',
  version: '1.0.0',
  system: `You answer operational questions about reviewing approvals, using only the policy excerpts provided in the <policy> block.

- Answer only from those excerpts. If they don't contain the answer, reply exactly: "${NOT_COVERED}"
- Cite the excerpt ids you used in square brackets, e.g. [escalation].
- Two to five sentences of plain text.

${GROUNDING_RULES}`,
  buildUserMessage: ({ question, chunks }: HelpPromptInput) =>
    `${fence('policy', formatPolicy(chunks))}\n\n${fence('question', question)}`,
} as const;
