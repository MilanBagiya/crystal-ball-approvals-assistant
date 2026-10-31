import {
  GreetingSchema,
  type ApprovalItem,
  type FallbackReason,
  type GreetingRequest,
  type GreetingResponse,
} from '@approvals/contracts';
import { buildGreetingTemplate } from '../domain/greetingTemplate';
import { toFallbackReason } from '../llm/errors';
import type { LlmRunner } from '../llm/llmRunner';
import type { Logger } from '../logging/logger';
import { activePrompts, promptRef } from '../prompts';
import { keepsNumbersFrom, parseModelJson } from './modelOutput';

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
              { role: 'user', content: prompt.buildUserMessage({ template, language: input.language ?? 'en' }) },
            ],
            maxTokens: 200,
          },
          { prompt: promptRef(prompt), ...(signal ? { signal } : {}) },
        );
      } catch (error) {
        return fallback(toFallbackReason(error));
      }

      const parsed = GreetingSchema.safeParse(parseModelJson(text));
      if (!parsed.success || !keepsNumbersFrom(template, parsed.data.greeting)) return fallback('invalid_output');
      return { greeting: parsed.data.greeting.trim(), source: 'ai' };
    },
  };
}

export type GreetingService = ReturnType<typeof createGreetingService>;
