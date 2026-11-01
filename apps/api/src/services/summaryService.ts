import type { ApprovalItem, StreamEvent, SummaryRequest } from '@approvals/contracts';
import { rankApprovals } from '../domain/urgency';
import type { LlmRunner } from '../llm/llmRunner';
import type { Logger } from '../logging/logger';
import { activePrompts, promptRef } from '../prompts';
import { summaryEvents } from './summaryParser';

// The ranking is computed here, in code. The model only writes the headline and per-item reasons.
export function createSummaryService(deps: {
  runner: LlmRunner;
  listApprovals: () => readonly ApprovalItem[];
  logger: Logger;
}) {
  const prompt = activePrompts.summary;

  return {
    stream(input: SummaryRequest, signal: AbortSignal): AsyncIterable<StreamEvent> {
      const ranked = rankApprovals(deps.listApprovals());
      const modelChunks = deps.runner.stream(
        {
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.buildUserMessage({ ranked, language: input.language }) }],
          maxTokens: 800,
        },
        { prompt: promptRef(prompt), signal },
      );

      return summaryEvents(modelChunks, ranked, (rejection) =>
        deps.logger.log({ level: 'warn', event: 'summary_line_rejected', ...rejection }),
      );
    },
  };
}

export type SummaryService = ReturnType<typeof createSummaryService>;
