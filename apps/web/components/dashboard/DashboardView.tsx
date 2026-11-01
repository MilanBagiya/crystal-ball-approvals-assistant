'use client';

import type { Urgency } from '@approvals/contracts';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, PencilLine, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { StatusBadge } from '@/components/approvals/StatusBadge';
import { longDate, TYPE_STYLES } from '@/components/approvals/typeStyles';
import { ErrorNotice, TypingDots } from '@/components/assistant/StatusParts';
import { durationText } from '@/lib/format';
import { useAssistantStore } from '@/store/assistantStore';

const URGENCY_TONES: Record<Urgency, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-slate-100 text-slate-700',
};

const card = 'rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200';

function BriefingCard() {
  const briefing = useAssistantStore((s) => s.briefing);
  const loadBriefing = useAssistantStore((s) => s.loadBriefing);

  return (
    <section
      aria-label="Daily briefing"
      className="rounded-2xl bg-linear-to-br from-[#0f1f3d] to-[#2a1d63] p-5 text-white shadow-sm"
    >
      <div className="mb-2 flex items-center gap-2">
        <Sparkles aria-hidden="true" className="size-4 text-violet-300" />
        <h2 className="text-sm font-semibold">Daily briefing</h2>
        {briefing.data && (
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium">
            {briefing.data.source === 'ai' ? 'AI' : 'Standard'}
          </span>
        )}
        <button
          type="button"
          aria-label="Refresh briefing"
          onClick={() => void loadBriefing()}
          className="ml-auto grid size-7 place-items-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
        >
          <RefreshCw aria-hidden="true" className="size-3.5" />
        </button>
      </div>
      <div aria-live="polite">
        {briefing.status === 'loading' || briefing.status === 'idle' ? (
          <TypingDots label="Writing the briefing" />
        ) : briefing.data ? (
          <p className="text-base leading-relaxed text-white/90">{briefing.data.briefing}</p>
        ) : (
          <p className="text-sm text-white/80">{briefing.error?.message ?? "Couldn't load the briefing."}</p>
        )}
      </div>
    </section>
  );
}

export function DashboardView() {
  const dashboard = useAssistantStore((s) => s.dashboard);
  const loadDashboard = useAssistantStore((s) => s.loadDashboard);
  const loadBriefing = useAssistantStore((s) => s.loadBriefing);
  const selectItem = useAssistantStore((s) => s.selectItem);

  // Fresh on every visit: decisions are made on the Approvals page, so opening the Dashboard picks them up.
  useEffect(() => {
    void loadDashboard();
    void loadBriefing();
  }, [loadDashboard, loadBriefing]);

  const data = dashboard.data;
  const stats = data
    ? [
        { label: 'Pending', value: data.counts.pending_review, icon: Clock, tone: 'bg-orange-50 text-orange-600' },
        { label: 'Approved', value: data.counts.approved, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-600' },
        {
          label: 'Changes requested',
          value: data.counts.changes_requested,
          icon: PencilLine,
          tone: 'bg-amber-50 text-amber-600',
        },
        { label: 'Rejected', value: data.counts.rejected, icon: XCircle, tone: 'bg-red-50 text-red-600' },
      ]
    : [];
  const maxByType = data ? Math.max(1, ...Object.values(data.pendingByType)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-violet-700 uppercase">Overview</p>
          <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        </div>
        {data && <p className="text-xs text-slate-500">Updated {new Date(data.generatedAt).toLocaleTimeString()}</p>}
      </header>

      <BriefingCard />

      {dashboard.status === 'error' && (
        <ErrorNotice
          message={dashboard.error?.message ?? 'Something went wrong.'}
          onRetry={() => void loadDashboard()}
        />
      )}
      {!data && dashboard.status !== 'error' && <TypingDots label="Loading the dashboard" />}

      {data && (
        <>
          <ul aria-label="Queue status" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map(({ label, value, icon: Icon, tone }) => (
              <li key={label} className={`${card} flex items-center gap-3`}>
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`}>
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="text-2xl font-semibold text-slate-900">{value}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section aria-labelledby="deadlines-heading" className={card}>
              <h2 id="deadlines-heading" className="mb-1 text-sm font-semibold text-slate-900">
                Deadlines
              </h2>
              <p className="mb-3 text-xs text-slate-500">
                From the approval policy: safety items within 24 hours of submission, everything else within 72.
              </p>
              {data.deadlines.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing is waiting for review.</p>
              ) : (
                <ul aria-label="Deadlines" className="divide-y divide-slate-100">
                  {data.deadlines.map((d) => {
                    const Icon = TYPE_STYLES[d.type].icon;
                    return (
                      <li key={d.id} className="flex items-center gap-3 py-2.5">
                        <span
                          className={`grid size-9 shrink-0 place-items-center rounded-lg ${TYPE_STYLES[d.type].tile}`}
                        >
                          <Icon aria-hidden="true" className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{d.title}</p>
                          <p className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className={`rounded px-1.5 py-0.5 font-medium ${URGENCY_TONES[d.urgency]}`}>
                              {d.urgency}
                            </span>
                            {d.overdue ? (
                              <span className="inline-flex items-center gap-1 font-medium text-red-700">
                                <AlertTriangle aria-hidden="true" className="size-3" />
                                {durationText(-d.hoursLeft)} overdue
                              </span>
                            ) : (
                              <span className="text-slate-600">Due in {durationText(d.hoursLeft)}</span>
                            )}
                            <span className="text-slate-400">· due {longDate(d.dueAt.slice(0, 10))}</span>
                          </p>
                        </div>
                        <Link
                          href="/"
                          onClick={() => selectItem(d.id)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-500"
                        >
                          Review <span className="sr-only">{d.title}</span>
                          <ArrowRight aria-hidden="true" className="size-3.5" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <div className="flex flex-col gap-4">
              <section aria-labelledby="types-heading" className={card}>
                <h2 id="types-heading" className="mb-3 text-sm font-semibold text-slate-900">
                  Pending by type
                </h2>
                <ul aria-label="Pending by type" className="flex flex-col gap-2.5">
                  {Object.entries(data.pendingByType).map(([type, n]) => {
                    const style = TYPE_STYLES[type as keyof typeof TYPE_STYLES];
                    return (
                      <li key={type} className="text-xs">
                        <div className="mb-1 flex justify-between text-slate-600">
                          <span>{style.label}</span>
                          <span className="font-semibold text-slate-900">{n}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100" aria-hidden="true">
                          <div
                            className="h-2 rounded-full bg-violet-500 transition-all"
                            style={{ width: `${(n / maxByType) * 100}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section aria-labelledby="recent-heading" className={card}>
                <h2 id="recent-heading" className="mb-3 text-sm font-semibold text-slate-900">
                  Recent decisions
                </h2>
                {data.recentDecisions.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No decisions yet. Approve or reject items on the Approvals page.
                  </p>
                ) : (
                  <ul aria-label="Recent decisions" className="flex flex-col gap-2">
                    {data.recentDecisions.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate text-slate-800">{item.title}</span>
                        <StatusBadge status={item.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
