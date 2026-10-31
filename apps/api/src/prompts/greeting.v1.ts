import { fence, GROUNDING_RULES } from './shared';

export interface GreetingPromptInput {
  template: string;
  language: string;
}

export const greetingPromptV1 = {
  id: 'greeting',
  version: '1.0.0',
  system: `You rewrite the greeting a reviewer sees when they open their Approvals panel.

Make the template sound natural and friendly while staying professional.
Keep every number and fact from the template exactly. Do not add new facts.
One or two short sentences, at most 200 characters.
Respond with JSON only, exactly in this shape: {"greeting":"..."}

${GROUNDING_RULES}`,
  buildUserMessage: ({ template, language }: GreetingPromptInput) =>
    `Language: ${language}\n${fence('template', template)}`,
} as const;
