'use client';

import type { ApprovalItem } from '@approvals/contracts';
import { ChevronRight, Sparkles } from 'lucide-react';
import { useAssistantStore } from '@/store/assistantStore';
import { DecisionPanel } from './DecisionPanel';
import { PreReviewPanel } from './PreReviewPanel';
import { StatusBadge } from './StatusBadge';
import { longDate, STATUS_LABELS, TYPE_STYLES } from './typeStyles';

/** The right-hand pane: where the selected item lives and who submitted it, plus a hand-off to the assistant. */
export function ApprovalDetail({ item }: { item: ApprovalItem }) {
  const open = useAssistantStore((s) => s.open);
  const setView = useAssistantStore((s) => s.setView);
  const sendMessage = useAssistantStore((s) => s.sendMessage);

  const type = TYPE_STYLES[item.type];
  const Icon = type.icon;
  const breadcrumb = item.path.split('›').map((part) => part.trim());
  const pending = item.status === 'pending_review';

  const askAssistant = () => {
    open();
    setView('talk');
    void sendMessage('talk', `What should I check before approving "${item.title}"?`);
  };

  return (
    <section
      aria-label={item.title}
      className="flex min-h-0 flex-col overflow-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
    >
      <div className="border-b border-slate-100 px-5 py-4">
        <nav aria-label="Location" className="mb-2 flex flex-wrap items-center gap-1 text-xs text-slate-500">
          {breadcrumb.map((part, i) => (
            <span key={`${part}-${i}`} className="inline-flex items-center gap-1">
              {part}
              <ChevronRight aria-hidden="true" className="size-3" />
            </span>
          ))}
          <span className="font-medium text-violet-700">{item.title}</span>
        </nav>
        <h2 className="text-lg font-semibold text-slate-900">{item.title}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {type.label} submitted by {item.submittedBy} for review.
        </p>
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
          <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${type.tile}`}>
            <Icon aria-hidden="true" className="size-6" />
          </span>
          <p className="text-xs text-slate-500">Preview isn&apos;t available in this demo.</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Type</dt>
            <dd className="font-medium text-slate-800">{type.label}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Status</dt>
            <dd>
              <StatusBadge status={item.status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Submitted by</dt>
            <dd className="font-medium text-slate-800">{item.submittedBy}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Submitted</dt>
            <dd className="font-medium text-slate-800">{longDate(item.submittedAt)}</dd>
          </div>
        </dl>

        {pending ? (
          <>
            <PreReviewPanel itemId={item.id} />
            <DecisionPanel key={item.id} item={item} />
          </>
        ) : (
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <p className="font-medium">
              {STATUS_LABELS[item.status]}
              {item.reviewedAt ? ` on ${longDate(item.reviewedAt.slice(0, 10))}` : ''}
            </p>
            {item.reviewComment && <p className="mt-1 whitespace-pre-wrap text-slate-600">{item.reviewComment}</p>}
          </div>
        )}

        <button
          type="button"
          onClick={askAssistant}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
        >
          <Sparkles aria-hidden="true" className="size-4" />
          Ask the assistant about this item
        </button>
      </div>
    </section>
  );
}
