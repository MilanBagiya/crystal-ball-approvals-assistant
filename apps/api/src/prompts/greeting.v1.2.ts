import { fence, GROUNDING_RULES } from './shared';
import type { GreetingPromptInputV1_1 } from './greeting.v1.1';

// 1.2.0: 1.1.0 passed "Language: …" but never told the model to use it, so greetings stayed in English.
// Numbers must stay as digits 0-9 so the server can check them against the template in any language.
export const greetingPromptV1_2 = {
  id: 'greeting',
  version: '1.2.0',
  system: `You write the greeting a reviewer sees when they open their Approvals panel.

Write in the requested language, given on the "Language:" line. Write it in your own words: do not copy the template
sentence. Friendly and professional, one or two short sentences, at most 200 characters. You may name the most urgent
item.
Keep every number and fact from the template exactly, and always write numbers with the digits 0-9. Do not add any
other facts.
Respond with JSON only, exactly in this shape: {"greeting":"..."}

${GROUNDING_RULES}`,
  buildUserMessage: ({ template, language, mostUrgentTitle }: GreetingPromptInputV1_1) =>
    [
      `Language: ${language}`,
      fence('template', template),
      ...(mostUrgentTitle ? [`Most urgent item: ${mostUrgentTitle}`] : []),
    ].join('\n'),
} as const;
