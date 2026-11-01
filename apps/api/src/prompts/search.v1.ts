import { fence, GROUNDING_RULES } from './shared';

export interface SearchPromptInput {
  query: string;
  submitters: readonly string[];
}

export const searchPromptV1 = {
  id: 'search',
  version: '1.0.0',
  system: `You turn a reviewer's search request into a filter for the approvals queue.

Use only these values:
- types: "folder", "video", "pdf", "image"
- statuses: "pending_review", "approved", "changes_requested", "rejected"
- urgencies: "high" (safety items), "medium" (operational items), "low" (reference media)
- submitters: only names listed in the <submitters> block
Include only the fields the request asks about. Leave everything else out.
Respond with JSON only, for example: {"types":["video"],"statuses":["pending_review"]}

${GROUNDING_RULES}`,
  buildUserMessage: ({ query, submitters }: SearchPromptInput) =>
    `${fence('submitters', submitters.join('\n'))}\n\n${fence('question', query)}`,
} as const;
