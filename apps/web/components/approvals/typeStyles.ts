import type { ApprovalType } from '@approvals/contracts';
import { FileText, Film, Folder, Image as ImageIcon, type LucideIcon } from 'lucide-react';

export interface TypeStyle {
  label: string;
  icon: LucideIcon;
  /** Classes for the coloured icon tile. */
  tile: string;
}

export const TYPE_STYLES: Record<ApprovalType, TypeStyle> = {
  folder: { label: 'Folder', icon: Folder, tile: 'bg-amber-100 text-amber-600' },
  video: { label: 'Video', icon: Film, tile: 'bg-rose-100 text-rose-600' },
  pdf: { label: 'PDF', icon: FileText, tile: 'bg-blue-100 text-blue-600' },
  image: { label: 'Image', icon: ImageIcon, tile: 'bg-emerald-100 text-emerald-600' },
};

export const STATUS_LABELS: Record<string, string> = {
  pending_review: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  changes_requested: 'Changes requested',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-18" → "Sep 18". Parsed by hand so the date never shifts with the viewer's time zone. */
export function shortDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-').map(Number);
  return month && day ? `${MONTHS[month - 1]} ${day}` : isoDate;
}

/** "2026-09-18" → "18 Sep 2026". */
export function longDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return year && month && day ? `${day} ${MONTHS[month - 1]} ${year}` : isoDate;
}
