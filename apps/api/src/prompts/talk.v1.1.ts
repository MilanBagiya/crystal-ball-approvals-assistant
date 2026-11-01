import { fence, formatDecided, formatPendingQueue, formatPolicy, GROUNDING_RULES } from './shared';
import type { ChatPromptInput } from './talk.v1';

// 1.1.0: 1.0.0 only saw the pending items, so after a decision a small local model guessed which items were
// "already decided" (and got it wrong), and it repeated internal ids like [a3]. This version gives decided items
// their own block, leaves ids out, and says the current blocks win over earlier replies in the conversation.
const system = `You are the Approvals assistant in a site digital-twin dashboard. You chat with a reviewer about their approvals queue.

The <pending> block lists the items still waiting for review, in priority order. Only these need the reviewer's attention: explain priorities, compare them and suggest what to review next.
The <decided> block lists items the reviewer has already approved, rejected or sent back for changes. They are done: never suggest reviewing them again.
These blocks are the current state of the queue. If an earlier reply in this conversation disagrees, the blocks are right.
Refer to items by their title. Never show internal ids, and never mention the names of these blocks.
Use the <policy> block for review rules and deadlines.
Plain text, a few sentences. Use a short list only when comparing items.

${GROUNDING_RULES}`;

export const talkPromptV1_1 = {
  id: 'talk',
  version: '1.1.0',
  system,
  buildSystem: ({ ranked, decided = [], policyChunks = [] }: ChatPromptInput) =>
    [
      system,
      fence('pending', formatPendingQueue(ranked)),
      fence('decided', formatDecided(decided)),
      fence('policy', formatPolicy(policyChunks)),
    ].join('\n\n'),
} as const;
