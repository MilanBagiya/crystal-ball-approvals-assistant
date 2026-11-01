import {
  ReviewCheckSchema,
  ReviewModelOutputSchema,
  type ApprovalItem,
  type FallbackReason,
  type ReviewCheck,
  type ReviewResponse,
} from '@approvals/contracts';
import type { PolicyChunk } from '../domain/policyChunks';
import { fallbackChecklist, relevantChunkIds, reviewDeadline } from '../domain/reviewChecklist';
import { classifyTier, type RankedApproval } from '../domain/urgency';
import { toFallbackReason } from '../llm/errors';
import type { LlmRunner } from '../llm/llmRunner';
import { activePrompts, promptRef } from '../prompts';
import { keepsNumbersFrom, parseModelJson } from './modelOutput';

const MIN_CHECKS = 2;
const MAX_CHECKS = 6;

// AI-optional, like the greeting: the policy checklist already works. The model tailors it to the item.
// Code decides the deadline and which policy sections apply; every check the model writes must cite one of them
// and may not introduce numbers the policy doesn't contain.
export function createReviewService(deps: { runner: LlmRunner; policyChunks: readonly PolicyChunk[] }) {
  const prompt = activePrompts.review;

  return {
    async review(item: ApprovalItem, signal?: AbortSignal): Promise<ReviewResponse> {
      const ranked: RankedApproval = { item, rank: 0, urgency: 'low', ...classifyTier(item.title) };
      const chunkIds = relevantChunkIds(ranked);
      const chunks = deps.policyChunks.filter((chunk) => chunkIds.includes(chunk.id));
      const base = { itemId: item.id, deadline: reviewDeadline(ranked) };
      const fallback = (reason: FallbackReason): ReviewResponse => ({
        ...base,
        source: 'fallback',
        fallbackReason: reason,
        checks: fallbackChecklist(ranked),
      });

      let text: string;
      try {
        text = await deps.runner.complete(
          {
            system: prompt.system,
            messages: [{ role: 'user', content: prompt.buildUserMessage({ item, chunks }) }],
            maxTokens: 700,
          },
          { prompt: promptRef(prompt), ...(signal ? { signal } : {}) },
        );
      } catch (error) {
        return fallback(toFallbackReason(error));
      }

      const parsed = ReviewModelOutputSchema.safeParse(parseModelJson(text));
      if (!parsed.success) return fallback('invalid_output');

      const facts = `${chunks.map((c) => c.text).join(' ')} ${item.title}`;
      const checks = parsed.data.checks
        .map((raw) => ReviewCheckSchema.safeParse(raw))
        .flatMap((result): ReviewCheck[] => (result.success ? [result.data] : []))
        .filter((c) => chunkIds.includes(c.chunkId) && keepsNumbersFrom(facts, `${c.check} ${c.why}`))
        .slice(0, MAX_CHECKS);

      if (checks.length < MIN_CHECKS) return fallback('invalid_output');
      return { ...base, source: 'ai', checks };
    },
  };
}

export type ReviewService = ReturnType<typeof createReviewService>;
