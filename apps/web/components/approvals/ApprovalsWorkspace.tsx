'use client';

import { ArrowLeft, Info, Search } from 'lucide-react';
import { useState } from 'react';
import { PlaceholderButton } from '@/components/layout/PlaceholderButton';
import { useAssistantStore } from '@/store/assistantStore';
import { ApprovalDetail } from './ApprovalDetail';
import { ApprovalsTable } from './ApprovalsTable';

export function ApprovalsWorkspace() {
  const items = useAssistantStore((s) => s.approvals.items);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>();

  // Until the user picks a row, show the first item, as the reference screen does.
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-slate-200 sm:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <PlaceholderButton className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 focus-visible:outline-2 focus-visible:outline-violet-500">
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            Back to Dashboard
          </PlaceholderButton>
          <span className="inline-flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900">Approvals &amp; Review</h1>
            <span
              title="Items waiting for a reviewer. Select one to see its details, or ask the assistant."
              className="text-slate-400"
            >
              <Info aria-hidden="true" className="size-4" />
            </span>
          </span>
        </div>
        <label className="relative block max-w-lg">
          <span className="sr-only">Search approvals</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search approvals by title, author, folder, or page…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-100"
          />
        </label>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ApprovalsTable query={query} selectedId={selected?.id} onSelect={setSelectedId} />
        {selected && <ApprovalDetail item={selected} />}
      </div>
    </div>
  );
}
