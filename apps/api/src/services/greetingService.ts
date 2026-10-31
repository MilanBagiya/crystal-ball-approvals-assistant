import {
  GreetingSchema,
  type ApprovalItem,
  type FallbackReason,
  type GreetingRequest,
  type GreetingResponse,
} from '@approvals/contracts';
import { buildGreetingTemplate } from '../domain/greetingTemplate';
import { rankApprovals } from '../domain/urgency';
import { toFallbackReason } from '../llm/errors';
import type { LlmRunner } from '../llm/llmRunner';
import type { Logger } from '../logging/logger';
import { activePrompts, promptRef } from '../prompts';
import { keepsNumbersFrom, parseModelJson } from './modelOutput';

const normalise = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

// AI-optional: the template is already a complete greeting. The model only improves the tone,
// and anything short of a valid, fact-preserving answer falls back to the template.
export function createGreetingService(deps: { runner: LlmRunner; approvals: readonly ApprovalItem[]; logger: Logger }) {
  const prompt = activePrompts.greeting;

  return {
    async greet(input: GreetingRequest, signal?: AbortSignal): Promise<GreetingResponse> {
      const template = buildGreetingTemplate({
        items: deps.approvals,
        ...(input.localTime ? { localTime: input.localTime } : {}),
      });
      const mostUrgentTitle = rankApprovals(deps.approvals)[0]?.item.title;
      const fallback = (reason: FallbackReason): GreetingResponse => {
        deps.logger.log({ level: 'warn', event: 'greeting_fallback', reason });
        return { greeting: template, source: 'template' };
      };

      let text: string;
      try {
        text = await deps.runner.complete(
          {
            system: prompt.system,
            messages: [
              {
                role: 'user',
                content: prompt.buildUserMessage({
                  template,
                  language: input.language ?? 'en',
                  ...(mostUrgentTitle ? { mostUrgentTitle } : {}),
                }),
              },
            ],
            maxTokens: 200,
          },
          { prompt: promptRef(prompt), ...(signal ? { signal } : {}) },
        );
      } catch (error) {
        return fallback(toFallbackReason(error));
      }

      const parsed = GreetingSchema.safeParse(parseModelJson(text));
      // Numbers may come from the template or the item title the model was given; nothing else.
      const allowedFacts = `${template} ${mostUrgentTitle ?? ''}`;
      if (!parsed.success || !keepsNumbersFrom(allowedFacts, parsed.data.greeting)) return fallback('invalid_output');

      // A copy of the template isn't an AI greeting, so don't label it as one.
      if (normalise(parsed.data.greeting) === normalise(template)) {
        deps.logger.log({ level: 'info', event: 'greeting_unchanged' });
        return { greeting: template, source: 'template' };
      }
      return { greeting: parsed.data.greeting.trim(), source: 'ai' };
    },
  };
}

export type GreetingService = ReturnType<typeof createGreetingService>;
