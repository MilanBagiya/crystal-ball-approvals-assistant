import type { ApprovalItem, Urgency } from '@approvals/contracts';

// The data has no priority field and every item shares a date, so urgency can't come from the data alone.
// This documented, deterministic rule decides the order. The LLM only explains it (see README).
export type UrgencyTier = 'safety' | 'operational' | 'reference' | 'other';

// Most urgent first. A title is placed in the first tier that has a matching keyword.
const TIER_KEYWORDS: ReadonlyArray<{ tier: Exclude<UrgencyTier, 'other'>; keywords: readonly string[] }> = [
  { tier: 'safety', keywords: ['safety', 'sensor', 'emergency', 'hazard'] },
  { tier: 'operational', keywords: ['onboarding', 'checklist', 'patrol'] },
  { tier: 'reference', keywords: ['layout', 'map', 'demo'] },
];

const TIER_ORDER: Record<UrgencyTier, number> = { safety: 0, operational: 1, reference: 2, other: 3 };

const TIER_URGENCY: Record<UrgencyTier, Urgency> = {
  safety: 'high',
  operational: 'medium',
  reference: 'low',
  other: 'low',
};

export interface TierMatch {
  tier: UrgencyTier;
  keyword?: string;
}

export interface RankedApproval {
  item: ApprovalItem;
  rank: number;
  urgency: Urgency;
  tier: UrgencyTier;
  keyword?: string;
}

/** The urgency an item's title implies, whatever its status (used by search, which also covers decided items). */
export function urgencyOf(title: string): Urgency {
  return TIER_URGENCY[classifyTier(title).tier];
}

export function classifyTier(title: string): TierMatch {
  const words = title.toLowerCase().split(/[^a-z0-9]+/);

  for (const { tier, keywords } of TIER_KEYWORDS) {
    const keyword = keywords.find((kw) => words.some((word) => matchesKeyword(word, kw)));
    if (keyword) return { tier, keyword };
  }
  return { tier: 'other' };
}

// Whole words, plus simple plurals ("checklists", "sensors"), so "map" does not match "roadmapping".
function matchesKeyword(word: string, keyword: string): boolean {
  return word === keyword || word === `${keyword}s` || word === `${keyword}es`;
}

export function rankApprovals(items: readonly ApprovalItem[]): RankedApproval[] {
  return items
    .filter((item) => item.status === 'pending_review')
    .map((item) => ({ item, ...classifyTier(item.title) }))
    .sort(compareForUrgency)
    .map(({ item, tier, keyword }, index) => ({
      item,
      rank: index + 1,
      urgency: TIER_URGENCY[tier],
      tier,
      ...(keyword ? { keyword } : {}),
    }));
}

function compareForUrgency(a: { item: ApprovalItem } & TierMatch, b: { item: ApprovalItem } & TierMatch): number {
  return (
    TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
    a.item.submittedAt.localeCompare(b.item.submittedAt) || // ISO dates sort as strings: oldest first
    a.item.title.localeCompare(b.item.title, 'en') ||
    a.item.id.localeCompare(b.item.id) // last resort so the order is total
  );
}
