'use client';

import type { SearchFilter } from '@approvals/contracts';
import { ArrowLeft, Info, Search, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { TypingDots } from '@/components/assistant/StatusParts';
import { useAssistantStore } from '@/store/assistantStore';
import { ApprovalDetail } from './ApprovalDetail';
import { ApprovalsTable } from './ApprovalsTable';
import { STATUS_LABELS, TYPE_STYLES } from './typeStyles';

const URGENCY_LABELS = { high: 'High urgency', medium: 'Medium urgency', low: 'Low urgency' } as const;

/** The AI filter as readable chips, e.g. "Video", "Pending review", "Sam HelpAdmin". */
function filterChips(filter: SearchFilter): string[] {
  return [
    ...(filter.types ?? []).map((t) => TYPE_STYLES[t].label),
    ...(filter.statuses ?? []).map((s) => STATUS_LABELS[s] ?? s),
    ...(filter.urgencies ?? []).map((u) => URGENCY_LABELS[u]),
    ...(filter.submitters ?? []),
  ];
}

export function ApprovalsWorkspace() {
  const items = useAssistantStore((s) => s.approvals.items);
  const selectedId = useAssistantStore((s) => s.selectedId);
  const selectItem = useAssistantStore((s) => s.selectItem);
  const search = useAssistantStore((s) => s.search);
  const runSearch = useAssistantStore((s) => s.runSearch);
  const clearSearch = useAssistantStore((s) => s.clearSearch);
  const [query, setQuery] = useState('');

  // Until the user picks a row, show the first item, as the reference screen does.
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const result = search.status === 'done' ? search.data : undefined;

  // Typing filters by keyword as you go. Enter on a sentence asks the AI; a single word has nothing to interpret.
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (/\s/.test(query.trim())) void runSearch(query.trim());
  };
  const clear = () => {
    setQuery('');
    clearSearch();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-slate-200 sm:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-violet-500"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            Back to Dashboard
          </Link>
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
        <form onSubmit={submit} className="flex max-w-2xl flex-col gap-2">
          <label className="relative block">
            <span className="sr-only">Search approvals</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (search.status !== 'idle') clearSearch();
              }}
              placeholder='Search by title, author or folder, or ask: "safety items from Sam" + Enter'
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-100"
            />
          </label>
          {search.status === 'loading' && <TypingDots label="Searching with AI" />}
          {search.status === 'error' && <p className="text-xs text-red-700">{search.error?.message}</p>}
          {result && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {result.source === 'ai' ? (
                <div role="group" aria-label="AI filter" className="flex flex-wrap items-center gap-1.5">
                  <Sparkles aria-hidden="true" className="size-3.5 text-violet-600" />
                  {filterChips(result.filter).map((chip) => (
                    <span key={chip} className="rounded-full bg-violet-100 px-2.5 py-0.5 font-medium text-violet-800">
                      {chip}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="font-medium text-amber-700">
                  {result.fallbackReason ? 'AI unavailable, used a keyword match' : 'Keyword match'}
                </span>
              )}
              <span className="text-slate-500">
                {result.itemIds.length} {result.itemIds.length === 1 ? 'match' : 'matches'}
              </span>
              <button
                type="button"
                onClick={clear}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-100"
              >
                <X aria-hidden="true" className="size-3" />
                Clear search
              </button>
            </div>
          )}
        </form>
      </div>

      <div className="grid min-h-0 flex-1 items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ApprovalsTable
          query={result ? '' : query}
          {...(result ? { onlyIds: result.itemIds } : {})}
          selectedId={selected?.id}
          onSelect={selectItem}
        />
        {selected && <ApprovalDetail item={selected} />}
      </div>
    </div>
  );
}
