import { fence, GROUNDING_RULES } from './shared';

export interface GreetingPromptInputV1_1 {
  template: string;
  language: string;
  /** Title of the top-ranked item, so the model has something specific to mention. */
  mostUrgentTitle?: string;
}

// 1.1.0: a small model returned the 1.0.0 template word for word, so the AI step was invisible.
// This version asks for new wording and offers the most urgent item as something concrete to mention.
export const greetingPromptV1_1 = {
  id: 'greeting',
  version: '1.1.0',
  system: `You write the greeting a reviewer sees when they open their Approvals panel.

Write it in your own words: do not copy the template sentence. Friendly and professional, one or two short
sentences, at most 200 characters. You may name the most urgent item.
Keep every number and fact from the template exactly. Do not add any other facts.
Respond with JSON only, exactly in this shape: {"greeting":"..."}

${GROUNDING_RULES}`,
  buildUserMessage: ({ template, language, mostUrgentTitle }: GreetingPromptInputV1_1) =>
    [
      `Language: ${language}`,
      fence('template', template),
      ...(mostUrgentTitle ? [`Most urgent item: ${mostUrgentTitle}`] : []),
    ].join('\n'),
} as const;
