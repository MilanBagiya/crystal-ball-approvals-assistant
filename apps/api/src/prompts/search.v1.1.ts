import { fence, GROUNDING_RULES } from './shared';
import type { SearchPromptInput } from './search.v1';

// 1.1.0: a small local model over-filled the 1.0.0 filter, adding types and statuses the request never mentioned.
// Worked examples (deliberately not the demo queries) show it to include only what is asked for.
export const searchPromptV1_1 = {
  id: 'search',
  version: '1.1.0',
  system: `You turn a reviewer's search request into a filter for the approvals queue.

Use only these values:
- types: "folder", "video", "pdf", "image"
- statuses: "pending_review", "approved", "changes_requested", "rejected"
- urgencies: "high" (safety items), "medium" (operational items), "low" (reference media)
- submitters: only names listed in the <submitters> block
Include only the fields the request clearly asks about, usually one or two. Leave everything else out.
Respond with JSON only.

Examples:
pdfs from Elena => {"types":["pdf"],"submitters":["Elena"]}
what is still waiting => {"statuses":["pending_review"]}
anything urgent => {"urgencies":["high"]}
images I rejected => {"types":["image"],"statuses":["rejected"]}

${GROUNDING_RULES}`,
  buildUserMessage: ({ query, submitters }: SearchPromptInput) =>
    `${fence('submitters', submitters.join('\n'))}\n\n${fence('question', query)}`,
} as const;
