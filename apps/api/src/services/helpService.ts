import type { HelpRequest, StreamEvent } from '@approvals/contracts';
import type { PolicyChunk } from '../domain/policyChunks';
import { retrieve } from '../domain/retrieval';
import type { LlmRunner } from '../llm/llmRunner';
import { activePrompts, promptRef } from '../prompts';
import { formatPolicy } from '../prompts/shared';
import { fromFirstUserTurn, tokensWithFallback } from './textStream';

export const POLICY_NOT_COVERED =
  "The policy doesn't cover this. Try asking about SLAs, content checks, approve/reject rules, safety specs or escalation.";

// Mini RAG over the policy note. Retrieval is deterministic; the LLM only phrases an answer from the
// retrieved chunks, and isn't called at all when nothing relevant was found.
export function createHelpService(deps: { runner: LlmRunner; policyChunks: readonly PolicyChunk[] }) {
  const prompt = activePrompts.help;

  return {
    async *stream(input: HelpRequest, signal: AbortSignal): AsyncGenerator<StreamEvent, void, undefined> {
      const { matches, isRelevant } = retrieve(input.question, deps.policyChunks);
      if (!isRelevant) {
        yield { type: 'token', text: POLICY_NOT_COVERED };
        return;
      }

      const chunks = matches.map((m) => m.chunk);
      yield { type: 'sources', chunkIds: chunks.map((c) => c.id) };

      const modelChunks = deps.runner.stream(
        {
          system: prompt.system,
          messages: [
            ...fromFirstUserTurn(input.messages ?? []),
            { role: 'user', content: prompt.buildUserMessage({ question: input.question, chunks }) },
          ],
          maxTokens: 400,
        },
        { prompt: promptRef(prompt), signal },
      );

      yield* tokensWithFallback(modelChunks, () => `From the policy:\n\n${formatPolicy(chunks)}`);
    },
  };
}

export type HelpService = ReturnType<typeof createHelpService>;
