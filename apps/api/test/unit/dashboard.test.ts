import { DashboardSchema } from '@approvals/contracts';
import { createApprovalQueue } from '../../src/domain/approvalQueue';
import { buildDashboard, briefingTemplate } from '../../src/domain/dashboard';
import { seedApprovals } from '../fixtures/approvals';

// Seed items were submitted on 2026-09-18. The SLA clock starts at submission (data/policy.md):
// the safety item (a3) is due 24h later, the others 72h later.
const NOW = new Date('2026-09-19T12:00:00.000Z');

describe('buildDashboard', () => {
  it('counts the queue by status and pending items by type', () => {
    const queue = createApprovalQueue(seedApprovals(), () => NOW);
    queue.decide('a1', 'approve');
    queue.decide('a2', 'reject', 'Wrong site.');

    const dashboard = DashboardSchema.parse(buildDashboard(queue.list(), NOW));

    expect(dashboard.counts).toEqual({ pending_review: 2, approved: 1, changes_requested: 0, rejected: 1, total: 4 });
    expect(dashboard.pendingByType).toEqual({ folder: 0, video: 0, pdf: 1, image: 1 });
  });

  it('works out each pending deadline from the policy SLA, most urgent first', () => {
    const { deadlines } = buildDashboard(seedApprovals(), NOW);

    expect(deadlines.map((d) => [d.id, d.dueAt, d.hoursLeft, d.overdue])).toEqual([
      ['a3', '2026-09-19T00:00:00.000Z', -12, true],
      ['a2', '2026-09-21T00:00:00.000Z', 36, false],
      ['a1', '2026-09-21T00:00:00.000Z', 36, false],
      ['a4', '2026-09-21T00:00:00.000Z', 36, false],
    ]);
  });

  it('lists the latest decisions first, at most five', () => {
    let tick = 0;
    const queue = createApprovalQueue(seedApprovals(), () => new Date(NOW.getTime() + ++tick * 60_000));
    queue.decide('a1', 'approve');
    queue.decide('a4', 'approve');

    const { recentDecisions } = buildDashboard(queue.list(), NOW);

    expect(recentDecisions.map((i) => i.id)).toEqual(['a4', 'a1']);
  });
});

describe('briefingTemplate', () => {
  it('names the count, what is overdue, and where to start', () => {
    expect(briefingTemplate(buildDashboard(seedApprovals(), NOW))).toBe(
      '4 items are waiting for review, 1 of them overdue. Start with "Safety Equipment & Sensor Specs": it is 12 hours past its deadline.',
    );
  });

  it('gives the time left when nothing is overdue', () => {
    const early = new Date('2026-09-18T06:00:00.000Z');

    expect(briefingTemplate(buildDashboard(seedApprovals(), early))).toBe(
      '4 items are waiting for review. Start with "Safety Equipment & Sensor Specs": it is due in 18 hours.',
    );
  });

  it('switches to days once an item is more than two days late', () => {
    const late = new Date('2026-11-01T09:00:00.000Z');

    expect(briefingTemplate(buildDashboard(seedApprovals(), late))).toMatch(
      /^4 items are waiting for review, 4 of them overdue\. Start with "Safety Equipment & Sensor Specs": it is 43 days past its deadline\.$/,
    );
  });

  it('says the queue is clear when nothing is pending', () => {
    const queue = createApprovalQueue(seedApprovals(), () => NOW);
    for (const id of ['a1', 'a2', 'a3', 'a4']) queue.decide(id, 'approve');

    expect(briefingTemplate(buildDashboard(queue.list(), NOW))).toBe('All caught up: nothing is waiting for review.');
  });
});
