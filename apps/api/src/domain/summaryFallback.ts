import type { SummaryHeadline } from '@approvals/contracts';
import type { RankedApproval } from './urgency';

// Deterministic summary parts: used whenever the model's version is missing or invalid.

export function fallbackHeadline(ranked: readonly RankedApproval[]): SummaryHeadline {
  const first = ranked[0];
  const text = first
    ? `${ranked.length} ${ranked.length === 1 ? 'item is' : 'items are'} pending review. Start with "${first.item.title}".`
    : 'No items are pending review.';
  return { type: 'headline', text, pendingCount: ranked.length };
}

export function fallbackReason({ tier, keyword }: RankedApproval): string {
  const matched = keyword ? ` ("${keyword}")` : '';
  switch (tier) {
    case 'safety':
      return `Safety content${matched}: the policy requires review within 24 hours.`;
    case 'operational':
      return `Operational content${matched}: review within 72 hours, after safety items.`;
    case 'reference':
      return `Reference media${matched}: review within 72 hours, after safety and operational items.`;
    case 'other':
      return 'No urgency keywords in the title: review within 72 hours, after everything else.';
  }
}

/** The queue as numbered plain text, e.g. "1. Safety Equipment & Sensor Specs (high): ...". */
export function formatRankedQueue(ranked: readonly RankedApproval[]): string {
  return ranked.map((r) => `${r.rank}. ${r.item.title} (${r.urgency}): ${fallbackReason(r)}`).join('\n');
}
