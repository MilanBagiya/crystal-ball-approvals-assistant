import type { ApprovalItem, Dashboard, Deadline } from '@approvals/contracts';
import { rankApprovals, type RankedApproval } from './urgency';

const HOUR_MS = 3_600_000;

/** Review SLA from data/policy.md: 24 hours for safety items, 72 hours for everything else. */
export function slaHours({ tier }: Pick<RankedApproval, 'tier'>): number {
  return tier === 'safety' ? 24 : 72;
}

function deadlineFor(ranked: RankedApproval, now: Date): Deadline {
  const { item, urgency } = ranked;
  // The SLA clock starts on the submission date (dates in the seed are days, so midnight UTC).
  const dueAt = new Date(Date.parse(`${item.submittedAt}T00:00:00.000Z`) + slaHours(ranked) * HOUR_MS);
  const hoursLeft = Math.floor((dueAt.getTime() - now.getTime()) / HOUR_MS);
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    urgency,
    dueAt: dueAt.toISOString(),
    hoursLeft,
    overdue: hoursLeft < 0,
  };
}

/** Everything on the Dashboard page, computed in code from the live queue. */
export function buildDashboard(items: readonly ApprovalItem[], now: Date): Dashboard {
  const count = (status: ApprovalItem['status']) => items.filter((item) => item.status === status).length;
  const pending = items.filter((item) => item.status === 'pending_review');
  const ofType = (type: ApprovalItem['type']) => pending.filter((item) => item.type === type).length;

  return {
    generatedAt: now.toISOString(),
    counts: {
      pending_review: count('pending_review'),
      approved: count('approved'),
      changes_requested: count('changes_requested'),
      rejected: count('rejected'),
      total: items.length,
    },
    pendingByType: { folder: ofType('folder'), video: ofType('video'), pdf: ofType('pdf'), image: ofType('image') },
    // rankApprovals gives urgency order; a stable sort by time left keeps it for equal deadlines.
    deadlines: rankApprovals(items)
      .map((ranked) => deadlineFor(ranked, now))
      .sort((a, b) => a.hoursLeft - b.hoursLeft),
    recentDecisions: items
      .filter((item) => item.reviewedAt)
      .sort((a, b) => (b.reviewedAt ?? '').localeCompare(a.reviewedAt ?? ''))
      .slice(0, 5),
  };
}

/** "12 hours" up to two days, then "43 days". */
export function durationText(hours: number): string {
  return hours > 48 ? `${Math.floor(hours / 24)} days` : `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

/** The deterministic briefing: complete on its own, and the fallback for the AI briefing. */
export function briefingTemplate(dashboard: Dashboard): string {
  const pending = dashboard.counts.pending_review;
  const first = dashboard.deadlines[0];
  if (pending === 0 || !first) return 'All caught up: nothing is waiting for review.';

  const overdue = dashboard.deadlines.filter((d) => d.overdue).length;
  const waiting = `${pending} ${pending === 1 ? 'item is' : 'items are'} waiting for review`;
  const late = overdue > 0 ? `, ${overdue} of them overdue` : '';
  const when = first.overdue
    ? `it is ${durationText(-first.hoursLeft)} past its deadline`
    : `it is due in ${durationText(first.hoursLeft)}`;
  return `${waiting}${late}. Start with "${first.title}": ${when}.`;
}
