import { BriefingModelOutputSchema, type BriefingResponse, type Dashboard } from '@approvals/contracts';
import { briefingTemplate, durationText } from '../domain/dashboard';
import type { LlmRunner } from '../llm/llmRunner';
import { activePrompts, promptRef } from '../prompts';
import { keepsNumbersFrom, parseModelJson } from './modelOutput';

// AI-optional: code counts and does the date arithmetic; the model only phrases the result. Any number the model
// writes must already be in the facts, so it can't miscount or miscalculate a deadline.
export function createBriefingService(deps: { runner: LlmRunner }) {
  const prompt = activePrompts.briefing;

  return {
    async brief(dashboard: Dashboard, signal?: AbortSignal): Promise<BriefingResponse> {
      const template = briefingTemplate(dashboard);
      const fallback: BriefingResponse = { briefing: template, source: 'template' };
      const facts = {
        pending: dashboard.counts.pending_review,
        overdue: dashboard.deadlines.filter((d) => d.overdue).length,
        decided: dashboard.counts.total - dashboard.counts.pending_review,
        deadlines: dashboard.deadlines.map((d) => ({
          title: d.title,
          urgency: d.urgency,
          hoursLeft: d.hoursLeft,
          ...(d.overdue ? { late: durationText(-d.hoursLeft) } : { dueIn: durationText(d.hoursLeft) }),
        })),
      };

      let text: string;
      try {
        text = await deps.runner.complete(
          {
            system: prompt.system,
            messages: [{ role: 'user', content: prompt.buildUserMessage({ facts, template }) }],
            maxTokens: 300,
          },
          { prompt: promptRef(prompt), ...(signal ? { signal } : {}) },
        );
      } catch {
        return fallback;
      }

      const parsed = BriefingModelOutputSchema.safeParse(parseModelJson(text));
      if (!parsed.success || !keepsNumbersFrom(`${JSON.stringify(facts)} ${template}`, parsed.data.briefing)) {
        return fallback;
      }
      // Code decides where to start: the briefing must name the most urgent item (if anything is pending).
      const start = dashboard.deadlines[0]?.title;
      if (start && !parsed.data.briefing.toLowerCase().includes(start.toLowerCase())) return fallback;
      return { briefing: parsed.data.briefing, source: 'ai' };
    },
  };
}

export type BriefingService = ReturnType<typeof createBriefingService>;
