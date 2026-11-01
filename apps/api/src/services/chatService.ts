import type { ApprovalItem, ChatRequest, StreamEvent } from '@approvals/contracts';
import { formatTeachFallback } from '../content/teachSteps';
import type { PolicyChunk } from '../domain/policyChunks';
import { formatRankedQueue } from '../domain/summaryFallback';
import { rankApprovals } from '../domain/urgency';
import type { LlmRunner } from '../llm/llmRunner';
import { activePrompts, promptRef } from '../prompts';
import { fromFirstUserTurn, tokensWithFallback } from './textStream';

export const TALK_UNAVAILABLE = "The assistant is unavailable right now. Here's the current queue in priority order:";

// "Talk to me" and "Teach me" share one endpoint. Open-ended language is where the LLM is actually needed;
// the queue and policy are injected here, server-side, so the client can't change the context.
export function createChatService(deps: {
  runner: LlmRunner;
  listApprovals: () => readonly ApprovalItem[];
  policyChunks: readonly PolicyChunk[];
}) {
  return {
    stream(input: ChatRequest, signal: AbortSignal): AsyncIterable<StreamEvent> {
      const ranked = rankApprovals(deps.listApprovals());
      const prompt = activePrompts[input.mode];
      const fallback =
        input.mode === 'teach' ? formatTeachFallback : () => `${TALK_UNAVAILABLE}\n\n${formatRankedQueue(ranked)}`;

      const modelChunks = deps.runner.stream(
        {
          system: prompt.buildSystem({ ranked, policyChunks: deps.policyChunks }),
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
