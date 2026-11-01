// Helpers for reading model text as data. Model output is untrusted: parse, then validate with Zod.

const CODE_FENCE = /^```[a-z]*\s*\n?([\s\S]*?)\n?\s*```$/i;

/**
 * Parses JSON, tolerating a markdown code fence around it and an object wrapped in a one-item array (both common
 * small-model habits). Returns undefined instead of throwing. The result still has to pass the caller's Zod schema.
 */
export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = CODE_FENCE.exec(trimmed)?.[1] ?? trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    return undefined;
  }
  return Array.isArray(parsed) && parsed.length === 1 ? (parsed[0] as unknown) : parsed;
}

/**
 * True if every number in `text` also appears in `source`, so the model can reword but not change the facts.
 * Digits from other scripts (e.g. Devanagari ५) can't be compared this way, so any of them fails the check.
 */
export function keepsNumbersFrom(source: string, text: string): boolean {
  if (/[^\P{Nd}0-9]/u.test(text)) return false;
  const allowed = new Set(source.match(/[0-9]+/g) ?? []);
  return (text.match(/[0-9]+/g) ?? []).every((n) => allowed.has(n));
}
