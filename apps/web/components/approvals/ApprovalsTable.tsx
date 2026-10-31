'use client';

import type { ApprovalType } from '@approvals/contracts';
import { FileText, Film, Folder, Image as ImageIcon, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useAssistantStore } from '@/store/assistantStore';

const TYPE_ICONS: Record<ApprovalType, LucideIcon> = { folder: Folder, video: Film, pdf: FileText, image: ImageIcon };

const STATUS_LABELS: Record<string, string> = {
  pending_review: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  changes_requested: 'Changes requested',
};

export function ApprovalsTable() {
  const approvals = useAssistantStore((s) => s.approvals);
  const loadApprovals = useAssistantStore((s) => s.loadApprovals);

  useEffect(() => {
    if (approvals.status === 'idle') void loadApprovals();
  }, [approvals.status, loadApprovals]);

  return (
    <section aria-labelledby="queue-heading" className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <h2 id="queue-heading" className="text-base font-semibold">
          Pending approvals
        </h2>
        {approvals.status === 'done' && (
          <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
            {approvals.items.length} items
          </span>
        )}
      </div>

      {approvals.status === 'error' && (
        <p role="alert" className="px-4 py-6 text-sm text-red-700">
          Couldn&apos;t load the approvals queue. Check that the API is running and refresh the page.
        </p>
      )}
      {(approvals.status === 'idle' || approvals.status === 'loading') && (
        <p role="status" className="px-4 py-6 text-sm text-slate-500">
          Loading approvals…
        </p>
      )}

      {approvals.status === 'done' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Item
                </th>
                <th scope="col" className="hidden px-4 py-2 font-medium md:table-cell">
                  Location
                </th>
                <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">
                  Submitted by
                </th>
                <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">
                  Submitted
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {approvals.items.map((item) => {
                const Icon = TYPE_ICONS[item.type];
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <span className="inline-flex items-center gap-2">
                        <Icon aria-label={item.type} className="size-4 shrink-0 text-slate-400" />
                        {item.title}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{item.path}</td>
                    <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{item.submittedBy}</td>
                    <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{item.submittedAt}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
