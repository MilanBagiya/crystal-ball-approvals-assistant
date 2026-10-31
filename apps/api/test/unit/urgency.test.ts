import { classifyTier, rankApprovals } from '../../src/domain/urgency';
import { makeItem, seedApprovals } from '../fixtures/approvals';

const ids = (ranked: { item: { id: string } }[]) => ranked.map((r) => r.item.id);

describe('classifyTier', () => {
  it.each([
    ['Safety Equipment & Sensor Specs', 'safety'],
    ['Emergency Exit Plan', 'safety'],
    ['Hazard Register', 'safety'],
    ['Site Patrol Onboarding & Checklists', 'operational'],
    ['360° Spatial Zone Layout & Camera Map', 'reference'],
    ['Quarterly Newsletter', 'other'],
  ])('puts "%s" in the %s tier', (title, tier) => {
    expect(classifyTier(title).tier).toBe(tier);
  });

  it('matches plurals and is case-insensitive ("SENSORS" is a sensor item)', () => {
    expect(classifyTier('SENSORS overview').tier).toBe('safety');
  });

  it('does not match a keyword inside an unrelated word ("mapping" is not "map")', () => {
    expect(classifyTier('Roadmapping notes').tier).toBe('other');
  });

  it('uses the most urgent tier when a title has keywords from several tiers', () => {
    // "Patrol" (operational) beats "Demo" (reference).
    expect(classifyTier('Level 2 Drone Patrol Video Demo')).toEqual({ tier: 'operational', keyword: 'patrol' });
  });
});

describe('rankApprovals', () => {
  it('puts the safety PDF first in the seeded queue', () => {
    const [first] = rankApprovals(seedApprovals());

    expect(first).toMatchObject({ rank: 1, urgency: 'high', item: { id: 'a3', type: 'pdf' } });
  });

  it('ranks the full seeded queue by the documented rule', () => {
    // a3 safety; a2 and a1 both operational (same date, so title breaks the tie: "Level…" < "Site…"); a4 reference.
    const ranked = rankApprovals(seedApprovals());

    expect(ranked.map((r) => [r.item.id, r.rank, r.urgency])).toEqual([
      ['a3', 1, 'high'],
      ['a2', 2, 'medium'],
      ['a1', 3, 'medium'],
      ['a4', 4, 'low'],
    ]);
  });

  it('gives the same order whatever order the input is in', () => {
    const seed = seedApprovals();
    const expected = ids(rankApprovals(seed));

    expect(ids(rankApprovals([...seed].reverse()))).toEqual(expected);
    expect(ids(rankApprovals([seed[2]!, seed[0]!, seed[3]!, seed[1]!]))).toEqual(expected);
  });

  it('breaks a tie within a tier by oldest submittedAt first', () => {
    const newer = makeItem({ title: 'A Safety note', submittedAt: '2026-09-20' });
    const older = makeItem({ title: 'B Safety note', submittedAt: '2026-09-01' });

    expect(ids(rankApprovals([newer, older]))).toEqual([older.id, newer.id]);
  });

  it('breaks a tie on tier and date by title', () => {
    const b = makeItem({ title: 'B hazard log' });
    const a = makeItem({ title: 'A hazard log' });

    expect(ids(rankApprovals([b, a]))).toEqual([a.id, b.id]);
  });

  it('ranks tier above age: a new safety item beats an old reference item', () => {
    const oldMap = makeItem({ title: 'Floor map', submittedAt: '2025-01-01' });
    const newSafety = makeItem({ title: 'Sensor calibration', submittedAt: '2026-09-30' });

    expect(ids(rankApprovals([oldMap, newSafety]))).toEqual([newSafety.id, oldMap.id]);
  });

  it('puts unclassified items last with low urgency', () => {
    const other = makeItem({ title: 'Quarterly Newsletter' });
    const reference = makeItem({ title: 'Camera map' });

    const ranked = rankApprovals([other, reference]);

    expect(ids(ranked)).toEqual([reference.id, other.id]);
    expect(ranked[1]).toMatchObject({ tier: 'other', urgency: 'low', rank: 2 });
  });

  it('ranks only items that are pending review', () => {
    const approved = makeItem({ title: 'Safety audit', status: 'approved' });
    const pending = makeItem({ title: 'Camera map' });

    expect(ids(rankApprovals([approved, pending]))).toEqual([pending.id]);
  });

  it('does not mutate its input', () => {
    const seed = seedApprovals();
    const before = ids(seed.map((item) => ({ item })));

    rankApprovals(seed);

    expect(ids(seed.map((item) => ({ item })))).toEqual(before);
  });
});
