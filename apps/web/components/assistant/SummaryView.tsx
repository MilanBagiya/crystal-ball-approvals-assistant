'use client';

import type { Urgency } from '@approvals/contracts';
import { RefreshCw } from 'lucide-react';
import { useAssistantStore } from '@/store/assistantStore';
import { ErrorNotice, FallbackNotice } from './StatusParts';

const URGENCY_STYLES: Record<Urgency, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-slate-100 text-slate-700',
};

function SummarySkeleton() {
  return (
    <div role="status" aria-label="Loading summary" className="flex animate-pulse flex-col gap-3">
      <div className="h-4 w-3/4 rounded bg-slate-200" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 rounded-lg bg-slate-100" />
      ))}
    </div>
  );
}

export function SummaryView() {
  const summary = useAssistantStore((s) => s.summary);
  const status = useAssistantStore((s) => s.status);
  const error = useAssistantStore((s) => s.error);
  const approvals = useAssistantStore((s) => s.approvals.items);
  const runSummary = useAssistantStore((s) => s.runSummary);
  const retry = useAssistantStore((s) => s.retry);

  const titleOf = (id: string) => approvals.find((a) => a.id === id)?.title ?? id;
  const busy = status === 'loading' || status === 'streaming';
  const nothingYet = !summary.headline && summary.items.length === 0;

  return (
    <div aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
      {busy && nothingYet && <SummarySkeleton />}
      {status === 'error' && error && <ErrorNotice message={error.message} onRetry={() => void retry()} />}

      {summary.fallback && (
        <div>
          <FallbackNotice />
          {summary.items.length === 0 && <p className="text-sm whitespace-pre-wrap">{summary.fallback.content}</p>}
        </div>
      )}
      {summary.headline && <p className="text-sm font-medium text-slate-800">{summary.headline.text}</p>}

      {summary.items.length > 0 && (
        <ol className="flex flex-col gap-2">
          {summary.items.map((item) => (
            <li key={item.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#16294d] text-xs font-semibold text-white">
                  {item.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-900">{titleOf(item.id)}</h3>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    <span className={`rounded px-1.5 py-0.5 font-medium ${URGENCY_STYLES[item.urgency]}`}>
                      {item.urgency}
                    </span>
                    {item.source === 'fallback' && (
                      <span className="rounded px-1.5 py-0.5 text-slate-500 ring-1 ring-slate-200">
                        Standard ranking
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-slate-600">{item.reason}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {!busy && !nothingYet && (
        <button
          type="button"
          onClick={() => void runSummary()}
          className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          <RefreshCw aria-hidden="true" className="size-3.5" />
          Refresh summary
        </button>
      )}
    </div>
  );
}
