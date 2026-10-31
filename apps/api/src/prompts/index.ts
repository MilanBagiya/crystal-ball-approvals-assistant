import { greetingPromptV1_1 } from './greeting.v1.1';
import { helpPromptV1_1 } from './help.v1.1';
import { summaryPromptV1_1 } from './summary.v1.1';
import { talkPromptV1 } from './talk.v1';
import { teachPromptV1_1 } from './teach.v1.1';

// The active version of each prompt. To change a prompt, add e.g. summary.v2.ts with a bumped
// `version` and point this registry at it. Usage logs record id + version, so outputs stay traceable.
export const activePrompts = {
  // 1.1.0 replaced 1.0.0 (still in greeting.v1.ts): new wording instead of a copy of the template.
  greeting: greetingPromptV1_1,
  // 1.1.0 replaced 1.0.0 (still in summary.v1.ts) after a small local model ignored the described format.
  summary: summaryPromptV1_1,
  // 1.1.0 replaced 1.0.0 (still in help.v1.ts): quote the policy sentence first, then answer.
  help: helpPromptV1_1,
  talk: talkPromptV1,
  // 1.1.0 replaced 1.0.0 (still in teach.v1.ts): plain text only, prompt blocks never mentioned.
  teach: teachPromptV1_1,
} as const;

export const promptRef = (prompt: { id: string; version: string }) => ({ id: prompt.id, version: prompt.version });
