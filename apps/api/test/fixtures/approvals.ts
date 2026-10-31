import type { ApprovalItem } from '@approvals/contracts';
import { APPROVALS_FILE } from '../../src/config/paths';
import { loadApprovals } from '../../src/data/loadApprovals';

export const seedApprovals = (): ApprovalItem[] => loadApprovals(APPROVALS_FILE);

let nextId = 1;

export function makeItem(overrides: Partial<ApprovalItem> = {}): ApprovalItem {
  return {
    id: `t${nextId++}`,
    title: 'Untitled item',
    type: 'pdf',
    submittedBy: 'Test User',
    path: 'Tests › Fixtures',
    status: 'pending_review',
    submittedAt: '2026-09-18',
    ...overrides,
  };
}
