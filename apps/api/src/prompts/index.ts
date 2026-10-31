import { greetingPromptV1 } from './greeting.v1';
import { helpPromptV1 } from './help.v1';
import { summaryPromptV1 } from './summary.v1';
import { talkPromptV1 } from './talk.v1';
import { teachPromptV1 } from './teach.v1';

// The active version of each prompt. To change a prompt, add e.g. summary.v2.ts with a bumped
// `version` and point this registry at it. Usage logs record id + version, so outputs stay traceable.
export const activePrompts = {
  greeting: greetingPromptV1,
  summary: summaryPromptV1,
  help: helpPromptV1,
  talk: talkPromptV1,
  teach: teachPromptV1,
} as const;

export const promptRef = (prompt: { id: string; version: string }) => ({ id: prompt.id, version: prompt.version });
