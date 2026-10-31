import type { PolicyChunk } from './policyChunks';

// Keyword retrieval stands in for embeddings (pgvector). It's deterministic, explainable and good enough
// for a five-section policy note.

// Below this, the question isn't about the policy and the LLM is not called. One incidental body hit scores 1;
// a heading hit alone scores 3.
export const MIN_RELEVANCE_SCORE = 2;
const TITLE_BOOST = 2;
const TOP_K = 2;

const STOPWORDS = new Set(
  (
    'a about after all also am an and any are as at be before but by can could did do does for from get had has have ' +
    'how i if in instead is it its me my need of on or our should so than that the their them then there these they ' +
    'this to us was we were what when where which who why will with would you your'
  ).split(' '),
);

export interface ScoredChunk {
  chunk: PolicyChunk;
  score: number;
}

export interface RetrievalResult {
  matches: ScoredChunk[];
  bestScore: number;
  isRelevant: boolean;
}

// Lowercase, strip punctuation and stopwords, singularise simple plurals, de-duplicate (order kept).
export function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map(singularise);
  return [...new Set(words)];
}

function singularise(word: string): string {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

// Exact match, or a shared stem of 4+ letters ("spec" ~ "specification", "request" ~ "requesting").
function termsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 4 && longer.startsWith(shorter);
}

function scoreChunk(questionTerms: readonly string[], chunk: PolicyChunk): number {
  const titleTerms = tokenize(chunk.title);
  const allTerms = [...titleTerms, ...tokenize(chunk.text)];

  return questionTerms.reduce((score, term) => {
    const inChunk = allTerms.some((t) => termsMatch(term, t)) ? 1 : 0;
    const inTitle = titleTerms.some((t) => termsMatch(term, t)) ? TITLE_BOOST : 0;
    return score + inChunk + inTitle;
  }, 0);
}

export function retrieve(question: string, chunks: readonly PolicyChunk[]): RetrievalResult {
  const terms = tokenize(question);
  const matches = chunks
    .map((chunk) => ({ chunk, score: scoreChunk(terms, chunk) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score) // stable sort: ties keep policy order
    .slice(0, TOP_K);

  const bestScore = matches[0]?.score ?? 0;
  return { matches, bestScore, isRelevant: bestScore >= MIN_RELEVANCE_SCORE };
}
