import type { ApprovalItem } from '@approvals/contracts';
import { STATUS_LABELS } from './typeStyles';

const STATUS_TONES: Record<ApprovalItem['status'], string> = {
  pending_review: 'bg-orange-100 text-orange-700',
  approved: 'bg-emerald-100 text-emerald-800',
  changes_requested: 'bg-amber-100 text-amber-900',
  rejected: 'bg-red-100 text-red-800',
};

export function StatusBadge({ status }: { status: ApprovalItem['status'] }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${STATUS_TONES[status]}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
