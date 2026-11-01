import {
  SearchFilterSchema,
  type ApprovalItem,
  type FallbackReason,
  type SearchFilter,
  type SearchResponse,
} from '@approvals/contracts';
import { urgencyOf } from '../domain/urgency';
import { toFallbackReason } from '../llm/errors';
import type { LlmRunner } from '../llm/llmRunner';
import { activePrompts, promptRef } from '../prompts';
import { parseModelJson } from './modelOutput';

/** Keyword match on the fields a reviewer would type: title, submitter, folder path and type. */
function matchesText(item: ApprovalItem, text: string): boolean {
  const needle = text.trim().toLowerCase();
  return [item.title, item.submittedBy, item.path, item.type].some((field) => field.toLowerCase().includes(needle));
}

export function matchesFilter(item: ApprovalItem, filter: SearchFilter): boolean {
  return (
    (!filter.types || filter.types.includes(item.type)) &&
    (!filter.statuses || filter.statuses.includes(item.status)) &&
    (!filter.urgencies || filter.urgencies.includes(urgencyOf(item.title))) &&
    (!filter.submitters || filter.submitters.includes(item.submittedBy)) &&
    (!filter.text || matchesText(item, filter.text))
  );
}

/** Maps names the model wrote ("Sam", "sam helpadmin") to real submitters; anything unknown is dropped. */
function knownSubmitters(names: readonly string[] | undefined, real: readonly string[]): string[] {
  const wanted = (names ?? []).map((name) => name.trim().toLowerCase());
  return real.filter((person) => {
    const full = person.toLowerCase();
    const first = full.split(' ')[0];
    return wanted.some((name) => name === full || name === first);
  });
}

// AI where it helps: one word is just a keyword search, so the model is only asked to interpret real sentences.
// The model returns a filter limited to known values; code applies it, so the result list can't be invented.
export function createSearchService(deps: { runner: LlmRunner; listApprovals: () => readonly ApprovalItem[] }) {
  const prompt = activePrompts.search;

  return {
    async search(rawQuery: string, signal?: AbortSignal): Promise<SearchResponse> {
      const query = rawQuery.trim();
      const items = deps.listApprovals();
      const respond = (filter: SearchFilter, source: SearchResponse['source'], reason?: FallbackReason) => ({
        query,
        filter,
        itemIds: items.filter((item) => matchesFilter(item, filter)).map((item) => item.id),
        source,
        ...(reason ? { fallbackReason: reason } : {}),
      });
      const keyword = (reason?: FallbackReason) => respond({ text: query }, 'keyword', reason);

      if (!/\s/.test(query)) return keyword();

      const submitters = [...new Set(items.map((item) => item.submittedBy))];
      let text: string;
      try {
        text = await deps.runner.complete(
          {
            system: prompt.system,
            messages: [{ role: 'user', content: prompt.buildUserMessage({ query, submitters }) }],
            maxTokens: 200,
          },
          { prompt: promptRef(prompt), ...(signal ? { signal } : {}) },
        );
      } catch (error) {
        return keyword(toFallbackReason(error));
      }

      const parsed = SearchFilterSchema.safeParse(parseModelJson(text));
      if (!parsed.success) return keyword('invalid_output');

      const people = knownSubmitters(parsed.data.submitters, submitters);
      const filter: SearchFilter = {
        ...(parsed.data.types ? { types: parsed.data.types } : {}),
        ...(parsed.data.statuses ? { statuses: parsed.data.statuses } : {}),
        ...(parsed.data.urgencies ? { urgencies: parsed.data.urgencies } : {}),
        ...(people.length > 0 ? { submitters: people } : {}),
      };
      // A filter with no usable criteria would match everything, which isn't an answer to the question.
      if (Object.keys(filter).length === 0) return keyword('invalid_output');
      return respond(filter, 'ai');
    },
  };
}

export type SearchService = ReturnType<typeof createSearchService>;
