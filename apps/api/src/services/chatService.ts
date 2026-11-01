import type { ApprovalItem, ChatRequest, StreamEvent } from '@approvals/contracts';
import { formatTeachFallback } from '../content/teachSteps';
import type { PolicyChunk } from '../domain/policyChunks';
import { formatDecidedList, formatRankedQueue } from '../domain/summaryFallback';
import { rankApprovals, type RankedApproval } from '../domain/urgency';
import type { LlmRunner } from '../llm/llmRunner';
import { activePrompts, promptRef } from '../prompts';
import { fromFirstUserTurn, tokensWithFallback } from './textStream';

export const TALK_UNAVAILABLE = "The assistant is unavailable right now. Here's the current queue in priority order:";

function talkFallback(ranked: readonly RankedApproval[], decided: readonly ApprovalItem[]): string {
  const text = `${TALK_UNAVAILABLE}\n\n${formatRankedQueue(ranked)}`;
  return decided.length > 0 ? `${text}\n\nAlready decided:\n${formatDecidedList(decided)}` : text;
}

// "Talk to me" and "Teach me" share one endpoint. Open-ended language is where the LLM is actually needed;
// the queue and policy are injected here, server-side, so the client can't change the context.
export function createChatService(deps: {
  runner: LlmRunner;
  listApprovals: () => readonly ApprovalItem[];
  policyChunks: readonly PolicyChunk[];
}) {
  return {
    stream(input: ChatRequest, signal: AbortSignal): AsyncIterable<StreamEvent> {
      const approvals = deps.listApprovals();
      const ranked = rankApprovals(approvals);
      const decided = approvals.filter((item) => item.status !== 'pending_review');
      const prompt = activePrompts[input.mode];
      const fallback = input.mode === 'teach' ? formatTeachFallback : () => talkFallback(ranked, decided);

      const modelChunks = deps.runner.stream(
        {
          system: prompt.buildSystem({ ranked, decided, policyChunks: deps.policyChunks }),
          messages: fromFirstUserTurn(input.messages),
          maxTokens: 600,
        },
        { prompt: promptRef(prompt), signal },
      );

      return tokensWithFallback(modelChunks, fallback);
    },
  };
}

export type ChatService = ReturnType<typeof createChatService>;
