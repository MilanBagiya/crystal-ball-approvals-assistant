import { briefingPromptV1 } from './briefing.v1';
import { commentPromptV1 } from './comment.v1';
import { greetingPromptV1_2 } from './greeting.v1.2';
import { helpPromptV1_1 } from './help.v1.1';
import { reviewPromptV1 } from './review.v1';
import { searchPromptV1_1 } from './search.v1.1';
import { summaryPromptV1_1 } from './summary.v1.1';
import { talkPromptV1_1 } from './talk.v1.1';
import { teachPromptV1_1 } from './teach.v1.1';

// The active version of each prompt. To change a prompt, add e.g. summary.v2.ts with a bumped
// `version` and point this registry at it. Usage logs record id + version, so outputs stay traceable.
export const activePrompts = {
  // 1.2.0 (writes in the requested language) replaced 1.1.0 (new wording) and 1.0.0; both are kept.
  greeting: greetingPromptV1_2,
  // 1.1.0 replaced 1.0.0 (still in summary.v1.ts) after a small local model ignored the described format.
  summary: summaryPromptV1_1,
  // 1.1.0 replaced 1.0.0 (still in help.v1.ts): quote the policy sentence first, then answer.
  help: helpPromptV1_1,
  // 1.1.0 replaced 1.0.0 (still in talk.v1.ts): decided items get their own block, and ids are left out.
  talk: talkPromptV1_1,
  // 1.1.0 replaced 1.0.0 (still in teach.v1.ts): plain text only, prompt blocks never mentioned.
  teach: teachPromptV1_1,
  review: reviewPromptV1,
  comment: commentPromptV1,
  briefing: briefingPromptV1,
  // 1.1.0 replaced 1.0.0 (still in search.v1.ts): worked examples stop a small model over-filling the filter.
  search: searchPromptV1_1,
} as const;

export const promptRef = (prompt: { id: string; version: string }) => ({ id: prompt.id, version: prompt.version });
