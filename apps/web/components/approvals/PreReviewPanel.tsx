'use client';

import { ClipboardCheck, Clock } from 'lucide-react';
import { ErrorNotice, FallbackNotice, TypingDots } from '@/components/assistant/StatusParts';
import { useAssistantStore } from '@/store/assistantStore';

/**
 * AI pre-review: a checklist tailored to the item, each check tied to a policy section.
 * The AI never suggests approve or reject: it only sees the item's metadata, not the file.
 */
export function PreReviewPanel({ itemId }: { itemId: string }) {
  const review = useAssistantStore((s) => s.reviews[itemId]);
  const runReview = useAssistantStore((s) => s.runReview);

  if (!review) {
    return (
      <button
        type="button"
        onClick={() => void runReview(itemId)}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 transition hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-violet-500"
      >
        <ClipboardCheck aria-hidden="true" className="size-4" />
        AI pre-review
      </button>
    );
  }

  if (review.status === 'loading') return <TypingDots label="Preparing the review checklist" />;
  if (review.status === 'error' || !review.data) {
    return (
      <ErrorNotice message={review.error?.message ?? 'Something went wrong.'} onRetry={() => void runReview(itemId)} />
    );
  }

  const { deadline, source, checks } = review.data;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
      {source === 'fallback' && <FallbackNotice />}
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <Clock aria-hidden="true" className="size-3.5 text-violet-600" />
        {deadline}
      </p>
      <ul aria-label="Review checklist" className="flex flex-col gap-2">
        {checks.map((check) => (
          <li key={`${check.chunkId}-${check.check}`} className="text-sm">
            <p className="font-medium text-slate-800">{check.check}</p>
            <p className="text-xs text-slate-500">
              {check.why}{' '}
              <span className="rounded bg-white px-1 py-0.5 font-mono ring-1 ring-slate-200">{check.chunkId}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
