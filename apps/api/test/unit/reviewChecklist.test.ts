import fs from 'node:fs';
import { POLICY_FILE } from '../../src/config/paths';
import { fallbackChecklist, reviewDeadline } from '../../src/domain/reviewChecklist';
import { rankApprovals } from '../../src/domain/urgency';
import { seedApprovals } from '../fixtures/approvals';

const policy = fs.readFileSync(POLICY_FILE, 'utf8');
const ranked = (id: string) => rankApprovals(seedApprovals()).find((r) => r.item.id === id)!;

describe('reviewDeadline', () => {
  it('is 24 hours for safety items and 72 hours for everything else, as the policy says', () => {
    expect(reviewDeadline(ranked('a3'))).toBe('Review within 24 hours (safety item)');
    expect(reviewDeadline(ranked('a2'))).toBe('Review within 72 hours');
    expect(policy).toContain('within 24 hours');
    expect(policy).toContain('within 72 hours');
  });
});

describe('fallbackChecklist', () => {
  it.each([
    ['a1', 'folder', 'No duplicate or empty files'],
    ['a2', 'video', 'Plays end to end'],
    ['a3', 'pdf', 'Text is searchable'],
    ['a4', 'image', 'Zone labels match the twin'],
  ])('covers the policy checks for %s (%s)', (id, _type, expected) => {
    expect(fallbackChecklist(ranked(id)).map((c) => c.check)).toContain(expected);
  });

  it('adds the safety specification rules only for safety items', () => {
    const safety = fallbackChecklist(ranked('a3')).map((c) => c.chunkId);
    const video = fallbackChecklist(ranked('a2')).map((c) => c.chunkId);

    expect(safety).toContain('safety-and-sensor-specifications');
    expect(video).not.toContain('safety-and-sensor-specifications');
  });

  it('only quotes numbers that appear in the policy', () => {
    for (const id of ['a1', 'a2', 'a3', 'a4']) {
      const text = fallbackChecklist(ranked(id))
        .map((c) => `${c.check} ${c.why}`)
        .join(' ');
      for (const n of text.match(/\d+/g) ?? []) expect(policy).toContain(n);
    }
  });
});
