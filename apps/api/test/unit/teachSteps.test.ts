import fs from 'node:fs';
import { POLICY_FILE } from '../../src/config/paths';
import { formatTeachFallback, TEACH_STEPS } from '../../src/content/teachSteps';

const policy = fs.readFileSync(POLICY_FILE, 'utf8');

describe('teach fallback guide', () => {
  it('has exactly five steps, each with a title and detail', () => {
    expect(TEACH_STEPS).toHaveLength(5);
    for (const step of TEACH_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.detail.length).toBeGreaterThan(0);
    }
  });

  it('formats as numbered steps 1-5 in order and ends by inviting a follow-up', () => {
    const text = formatTeachFallback();
    const numbers = [...text.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));

    expect(numbers).toEqual([1, 2, 3, 4, 5]);
    expect(text.trim().endsWith('?')).toBe(true);
  });

  it('only quotes time limits that the policy actually states', () => {
    // The fallback must never contradict policy.md (e.g. a "48 hours" SLA that doesn't exist).
    const limits = formatTeachFallback().match(/\d+ (?:hours?|months?)/g) ?? [];

    expect(limits.length).toBeGreaterThan(0);
    for (const limit of limits) expect(policy).toContain(limit);
  });
});
