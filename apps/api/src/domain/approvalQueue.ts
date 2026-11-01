import type { ApprovalItem } from '@approvals/contracts';

/** The approvals queue for the life of the process, seeded from data/approvals.json. */
export function createApprovalQueue(seed: readonly ApprovalItem[]) {
  // Copies, so the seed passed in (and the seed file data) is never changed.
  const items = seed.map((item) => ({ ...item }));

  return {
    list: (): readonly ApprovalItem[] => items,
    get: (id: string): ApprovalItem | undefined => items.find((item) => item.id === id),
  };
}

export type ApprovalQueue = ReturnType<typeof createApprovalQueue>;
