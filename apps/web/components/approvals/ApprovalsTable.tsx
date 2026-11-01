'use client';

import type { ApprovalItem } from '@approvals/contracts';
import { ListFilter } from 'lucide-react';
import { useEffect } from 'react';
import { itemCount } from '@/lib/format';
import { useAssistantStore } from '@/store/assistantStore';
import { StatusBadge } from './StatusBadge';
import { shortDate, TYPE_STYLES } from './typeStyles';

interface ApprovalsTableProps {
  query?: string;
  /** Limits the rows to these ids (an AI search result), in queue order. */
  onlyIds?: readonly string[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}

/** Case-insensitive match on title, submitter, path (folder) and type. */
function matches(item: ApprovalItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [item.title, item.submittedBy, item.path, item.type].some((field) => field.toLowerCase().includes(needle));
}

export function ApprovalsTable({ query = '', onlyIds, selectedId, onSelect }: ApprovalsTableProps) {
  const approvals = useAssistantStore((s) => s.approvals);
  const loadApprovals = useAssistantStore((s) => s.loadApprovals);

  useEffect(() => {
    if (approvals.status === 'idle') void loadApprovals();
  }, [approvals.status, loadApprovals]);

  const visible = approvals.items.filter((item) => matches(item, query) && (!onlyIds || onlyIds.includes(item.id)));

  return (
    <section
      aria-labelledby="queue-heading"
      className="flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
    >
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
        <ListFilter aria-hidden="true" className="size-4 text-violet-600" />
        <h2 id="queue-heading" className="text-xs font-semibold tracking-wide text-slate-700 uppercase">
          Pending approval requests
        </h2>
        {approvals.status === 'done' && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {itemCount(approvals.items.filter((item) => item.status === 'pending_review').length)}
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
        <div className="min-h-0 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th scope="col" className="px-4 py-2.5">
                  Folder / content name
                </th>
                <th scope="col" className="hidden px-3 py-2.5 md:table-cell">
                  Type
                </th>
                <th scope="col" className="hidden px-3 py-2.5 lg:table-cell">
                  Submitted by
                </th>
                <th scope="col" className="hidden px-3 py-2.5 sm:table-cell">
                  Date
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((item) => {
                const type = TYPE_STYLES[item.type];
                const Icon = type.icon;
                const selected = item.id === selectedId;
                return (
                  <tr
                    key={item.id}
                    onClick={() => onSelect?.(item.id)}
                    className={`cursor-pointer transition-colors ${
                      selected ? 'bg-violet-50/70 shadow-[inset_3px_0_0_var(--color-violet-500)]' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${type.tile}`}>
                          <Icon aria-hidden="true" className="size-4.5" />
                        </span>
                        <div className="min-w-0">
                          <button
                            type="button"
                            aria-label={`Select ${item.title}`}
                            aria-pressed={selected}
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelect?.(item.id);
                            }}
                            className="block max-w-full truncate text-left font-semibold text-slate-900 hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-violet-500"
                          >
                            {item.title}
                          </button>
                          <p className="truncate text-xs text-slate-500">{item.path}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 md:table-cell">
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600">
                        <Icon aria-hidden="true" className="size-3.5" />
                        {type.label}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 text-slate-600 lg:table-cell">{item.submittedBy}</td>
                    <td className="hidden px-3 py-3 whitespace-nowrap text-slate-600 sm:table-cell">
                      {shortDate(item.submittedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visible.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              {query.trim() ? <>No approvals match &quot;{query.trim()}&quot;.</> : 'No approvals match this search.'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
