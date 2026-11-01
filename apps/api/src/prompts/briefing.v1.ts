import { fence, GROUNDING_RULES } from './shared';

export interface BriefingPromptInput {
  /** Facts computed in code: counts and time left, already worked out. */
  facts: unknown;
  template: string;
}

export const briefingPromptV1 = {
  id: 'briefing',
  version: '1.0.0',
  system: `You write the short daily briefing at the top of a reviewer's Approvals dashboard.

Turn the facts in the <facts> block into two or three friendly, direct sentences (at most 400 characters): how much is
waiting, what is overdue, and which item to start with. The <template> block is a correct version you can improve on.
Every number is already worked out: copy numbers exactly and never calculate new ones. A negative hoursLeft means that
many hours past the deadline. Plain text, no markdown.
Respond with JSON only, exactly in this shape: {"briefing":"..."}

${GROUNDING_RULES}`,
  buildUserMessage: ({ facts, template }: BriefingPromptInput) =>
    `${fence('facts', JSON.stringify(facts))}\n\n${fence('template', template)}`,
} as const;
