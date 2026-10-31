import fs from 'node:fs';
import { POLICY_FILE } from '../../src/config/paths';
import { chunkPolicy } from '../../src/domain/policyChunks';
import { MIN_RELEVANCE_SCORE, retrieve, tokenize } from '../../src/domain/retrieval';

const chunks = chunkPolicy(fs.readFileSync(POLICY_FILE, 'utf8'));
const topIds = (question: string) => retrieve(question, chunks).matches.map((m) => m.chunk.id);

describe('chunkPolicy', () => {
  it('makes one chunk per ## section with a slug id', () => {
    expect(chunks.map((c) => c.id)).toEqual([
      'review-slas',
      'content-checks-by-type',
      'approve-reject-or-request-changes',
      'safety-and-sensor-specifications',
      'escalation',
    ]);
  });

  it('keeps each section body, and drops the preamble before the first ##', () => {
    const escalation = chunks.find((c) => c.id === 'escalation');

    expect(escalation?.title).toBe('Escalation');
    expect(escalation?.text).toMatch(/^Escalate to the Site Safety Lead/);
    expect(chunks.some((c) => c.text.includes('Applies to every item'))).toBe(false);
  });

  it('does not split on ### or on ## in the middle of a line', () => {
    const parsed = chunkPolicy('## One\nfirst ## not a heading\n### Sub\nmore\n## Two\nsecond');

    expect(parsed.map((c) => [c.id, c.text])).toEqual([
      ['one', 'first ## not a heading\n### Sub\nmore'],
      ['two', 'second'],
    ]);
  });
});

describe('tokenize', () => {
  it('lowercases, drops stopwords and punctuation, and singularises simple plurals', () => {
    expect(tokenize('What are the SLAs for Safety specs?')).toEqual(['sla', 'safety', 'spec']);
  });
});

describe('retrieve', () => {
  it('returns the safety chunk first for a question about safety specs', () => {
    expect(topIds('What do safety specs need to include?')[0]).toBe('safety-and-sensor-specifications');
  });

  it.each([
    ['How long do I have to review a video?', 'review-slas'],
    ['Who do I escalate an expired calibration to?', 'escalation'],
    ['When should I reject an item instead of requesting changes?', 'approve-reject-or-request-changes'],
    ['What should I check in a video before approving it?', 'content-checks-by-type'],
  ])('ranks the right chunk first for "%s"', (question, expected) => {
    expect(topIds(question)[0]).toBe(expected);
  });

  it('returns at most the top 2 chunks, best first', () => {
    const { matches } = retrieve('What do safety specs need to include?', chunks);

    expect(matches).toHaveLength(2);
    expect(matches[0]!.score).toBeGreaterThanOrEqual(matches[1]!.score);
  });

  it.each(['What is the weather in Paris tomorrow?', 'Write me a poem about cats', 'asdf qwerty'])(
    'marks an off-topic question ("%s") as not relevant',
    (question) => {
      const result = retrieve(question, chunks);

      expect(result.isRelevant).toBe(false);
      expect(result.bestScore).toBeLessThan(MIN_RELEVANCE_SCORE);
    },
  );

  it('marks an on-topic question as relevant', () => {
    expect(retrieve('What is the escalation process?', chunks).isRelevant).toBe(true);
  });

  it('is not relevant when a single generic word happens to appear in the policy', () => {
    // "date" appears in the policy body, but one incidental body hit must not justify an LLM call.
    expect(retrieve('What is the date today?', chunks).isRelevant).toBe(false);
  });

  it('never returns chunks that share no terms with the question', () => {
    const { matches } = retrieve('escalation', chunks);

    expect(matches.every((m) => m.score > 0)).toBe(true);
  });
});
