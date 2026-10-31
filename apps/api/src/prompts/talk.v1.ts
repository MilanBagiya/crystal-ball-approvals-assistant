import type { PolicyChunk } from '../domain/policyChunks';
import type { RankedApproval } from '../domain/urgency';
import { fence, formatPolicy, formatQueue, GROUNDING_RULES } from './shared';

export interface ChatPromptInput {
  ranked: readonly RankedApproval[];
  policyChunks?: readonly PolicyChunk[];
}

const system = `You are the Approvals assistant in a site digital-twin dashboard. You chat with a reviewer about their pending approvals queue.

The queue is in the <queue> block, already in priority order. Explain priorities, compare items and suggest what to review next.
Use the <policy> block for review rules and deadlines.
Plain text, a few sentences. Use a short list only when comparing items.

${GROUNDING_RULES}`;

export const talkPromptV1 = {
  id: 'talk',
  version: '1.0.0',
  system,
  buildSystem: ({ ranked, policyChunks = [] }: ChatPromptInput) =>
    `${system}\n\n${fence('queue', formatQueue(ranked))}\n\n${fence('policy', formatPolicy(policyChunks))}`,
} as const;
