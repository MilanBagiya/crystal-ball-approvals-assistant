import { CommentModelOutputSchema, type CommentDraftResponse } from '@approvals/contracts';
import { commentTemplate, type CommentInput } from '../domain/commentTemplate';
import type { PolicyChunk } from '../domain/policyChunks';
import { relevantChunkIds } from '../domain/reviewChecklist';
import { classifyTier } from '../domain/urgency';
import type { LlmRunner } from '../llm/llmRunner';
import { activePrompts, promptRef } from '../prompts';
import { keepsNumbersFrom, parseModelJson } from './modelOutput';

// AI-optional: the template is a complete, correct comment. The model turns the reviewer's notes into a friendlier
// message. It may only use facts from the notes, the item and the policy: any other number sends back the template.
export function createCommentService(deps: { runner: LlmRunner; policyChunks: readonly PolicyChunk[] }) {
  const prompt = activePrompts.comment;

  return {
    async draft(input: CommentInput, signal?: AbortSignal): Promise<CommentDraftResponse> {
      const template: CommentDraftResponse = { comment: commentTemplate(input), source: 'template' };
      const chunkIds = relevantChunkIds({
        item: input.item,
        rank: 0,
        urgency: 'low',
        ...classifyTier(input.item.title),
      });
      const chunks = deps.policyChunks.filter((chunk) => chunkIds.includes(chunk.id));

      let text: string;
      try {
        text = await deps.runner.complete(
          {
            system: prompt.system,
            messages: [{ role: 'user', content: prompt.buildUserMessage({ ...input, chunks }) }],
            maxTokens: 400,
          },
          { prompt: promptRef(prompt), ...(signal ? { signal } : {}) },
        );
      } catch {
        return template;
      }

      const parsed = CommentModelOutputSchema.safeParse(parseModelJson(text));
      const facts = [input.notes ?? '', input.item.title, ...chunks.map((c) => c.text)].join(' ');
      if (!parsed.success || !keepsNumbersFrom(facts, parsed.data.comment)) return template;
      return { comment: parsed.data.comment, source: 'ai' };
    },
  };
}

export type CommentService = ReturnType<typeof createCommentService>;
