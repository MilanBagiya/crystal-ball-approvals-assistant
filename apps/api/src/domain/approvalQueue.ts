import type { ApprovalItem, Decision } from '@approvals/contracts';

const STATUS_FOR: Record<Decision, ApprovalItem['status']> = {
  approve: 'approved',
  request_changes: 'changes_requested',
  reject: 'rejected',
};

export type DecideResult = { ok: true; item: ApprovalItem } | { ok: false; reason: 'not_found' | 'already_decided' };

/** The approvals queue for the life of the process, seeded from data/approvals.json. */
export function createApprovalQueue(seed: readonly ApprovalItem[], now: () => Date = () => new Date()) {
  // Copies, so the seed passed in (and the seed file data) is never changed.
  const items = seed.map((item) => ({ ...item }));

  return {
    /** Puts every item back to its seeded state, so a demo can start over. */
    reset(): void {
      items.splice(0, items.length, ...seed.map((item) => ({ ...item })));
    },
    list: (): readonly ApprovalItem[] => items,
    get: (id: string): ApprovalItem | undefined => items.find((item) => item.id === id),

    /** Records a reviewer's decision. Only a pending item can be decided, and only once. */
    decide(id: string, decision: Decision, comment?: string): DecideResult {
      const index = items.findIndex((item) => item.id === id);
      const current = items[index];
      if (!current) return { ok: false, reason: 'not_found' };
      if (current.status !== 'pending_review') return { ok: false, reason: 'already_decided' };

      const updated: ApprovalItem = {
        ...current,
        status: STATUS_FOR[decision],
        reviewedAt: now().toISOString(),
        ...(comment ? { reviewComment: comment } : {}),
      };
      items[index] = updated;
      return { ok: true, item: updated };
    },
  };
}

export type ApprovalQueue = ReturnType<typeof createApprovalQueue>;
