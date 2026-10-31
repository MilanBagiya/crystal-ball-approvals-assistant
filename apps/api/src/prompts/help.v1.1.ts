import { NOT_COVERED, type HelpPromptInput } from './help.v1';
import { fence, formatPolicy, GROUNDING_RULES } from './shared';

// 1.1.0: a small model answered from the right excerpt but named the wrong contact. Quoting the source sentence
// before answering keeps the model on the policy text (and lets the reviewer check the answer at a glance).
export const helpPromptV1_1 = {
  id: 'help',
  version: '1.1.0',
  system: `You answer operational questions about reviewing approvals, using only the policy excerpts provided in the <policy> block.

- Start with the exact sentence from the excerpts that answers the question, in double quotes.
- Then answer in one or two sentences, using only what that sentence says. Use names and roles exactly as written.
- Cite the excerpt ids you used in square brackets, e.g. [escalation].
- If the excerpts don't contain the answer, reply exactly: "${NOT_COVERED}"
- Plain text, no markdown.

${GROUNDING_RULES}`,
  buildUserMessage: ({ question, chunks }: HelpPromptInput) =>
    `${fence('policy', formatPolicy(chunks))}\n\n${fence('question', question)}`,
} as const;
