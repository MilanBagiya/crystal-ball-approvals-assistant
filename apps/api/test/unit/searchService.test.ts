import { SearchResponseSchema } from '@approvals/contracts';
import { createApprovalQueue } from '../../src/domain/approvalQueue';
import { createLlmRunner } from '../../src/llm/llmRunner';
import type { LlmClient } from '../../src/llm/LlmClient';
import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import { createSearchService } from '../../src/services/searchService';
import { seedApprovals } from '../fixtures/approvals';
import { failingLlm, fakeLlm, hangingLlm } from '../fakes/fakeLlm';

function search(llm: LlmClient, query: string, items = seedApprovals()) {
  const runner = createLlmRunner({ llm, timeoutMs: 50, logUsage: () => undefined });
  return createSearchService({ runner, listApprovals: () => items }).search(query);
}
const filterReply = (filter: object) => fakeLlm([JSON.stringify(filter)]);

describe('searchService: when the AI is used', () => {
  it('does not call the AI for a single word: a keyword match is enough', async () => {
    const llm = fakeLlm(['{}']);

    const result = SearchResponseSchema.parse(await search(llm, 'sam'));

    expect(llm.requests).toHaveLength(0);
    expect(result).toMatchObject({ source: 'keyword', filter: { text: 'sam' }, itemIds: ['a1', 'a3'] });
  });

  it('turns a sentence into a structured filter and applies it in code', async () => {
    const result = await search(filterReply({ urgencies: ['high'], submitters: ['Sam'] }), 'safety items from Sam');

    expect(result).toMatchObject({
      source: 'ai',
      filter: { urgencies: ['high'], submitters: ['Sam HelpAdmin'] },
      itemIds: ['a3'],
    });
  });

  it('filters by type and status', async () => {
    const result = await search(
      filterReply({ types: ['video'], statuses: ['pending_review'] }),
      'videos still pending',
    );

    expect(result.itemIds).toEqual(['a2']);
  });

  it('gives the model the allowed values and the real submitters, with the query fenced as user text', async () => {
    const llm = fakeLlm(['{}']);
    await search(llm, 'what did Elena send');

    const prompt = llm.requests[0]?.messages.at(-1)?.content ?? '';
    expect(prompt).toContain('Elena HelpAdmin');
    expect(prompt).toMatch(/<question>\s*what did Elena send\s*<\/question>/);
    expect(llm.requests[0]?.system).toContain('pending_review');
  });
});

describe('searchService: validation and fallback', () => {
  it('drops a submitter who is not in the queue', async () => {
    const result = await search(filterReply({ types: ['pdf'], submitters: ['Bob'] }), 'pdfs from Bob');

    expect(result).toMatchObject({ source: 'ai', filter: { types: ['pdf'] }, itemIds: ['a3'] });
    expect(result.filter.submitters).toBeUndefined();
  });

  it.each([
    ['a value outside the allowed list', { types: ['spreadsheet'] }],
    ['a filter with nothing usable left', { submitters: ['Bob'] }],
    ['an empty filter', {}],
  ])('falls back to keyword search for %s', async (_label, filter) => {
    const result = await search(filterReply(filter), 'show me things');

    expect(result).toMatchObject({
      source: 'keyword',
      fallbackReason: 'invalid_output',
      filter: { text: 'show me things' },
    });
  });

  it.each([
    ['a timeout', hangingLlm(), 'timeout'],
    ['a model error', failingLlm(new Error('500')), 'llm_error'],
    ['no API key', new UnavailableLlmClient('no_api_key'), 'no_api_key'],
  ])('falls back to keyword search on %s', async (_label, llm, reason) => {
    const result = await search(llm, 'videos from Alex');

    expect(result).toMatchObject({ source: 'keyword', fallbackReason: reason });
  });

  it('searches decided items too, by status', async () => {
    const queue = createApprovalQueue(seedApprovals());
    queue.decide('a4', 'approve');

    const result = await search(filterReply({ statuses: ['approved'] }), 'what have I approved', [...queue.list()]);

    expect(result.itemIds).toEqual(['a4']);
  });
});
