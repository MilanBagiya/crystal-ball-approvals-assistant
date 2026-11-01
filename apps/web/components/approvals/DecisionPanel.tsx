'use client';

import type { ApprovalItem, Decision } from '@approvals/contracts';
import { Check, PencilLine, Sparkles, X } from 'lucide-react';
import { useId, useState } from 'react';
import { useAssistantStore } from '@/store/assistantStore';

const CHOICES: { decision: Decision; label: string; confirm: string; icon: typeof Check; tone: string }[] = [
  {
    decision: 'approve',
    label: 'Approve',
    confirm: 'Confirm approval',
    icon: Check,
    tone: 'bg-emerald-600 text-white hover:bg-emerald-700',
  },
  {
    decision: 'request_changes',
    label: 'Request changes',
    confirm: 'Confirm request for changes',
    icon: PencilLine,
    tone: 'bg-amber-100 text-amber-900 hover:bg-amber-200',
  },
  {
    decision: 'reject',
    label: 'Reject',
    confirm: 'Confirm rejection',
    icon: X,
    tone: 'bg-red-100 text-red-800 hover:bg-red-200',
  },
];

/**
 * The reviewer's decision. The decision itself is never made by AI; the AI can only draft the comment for
 * "request changes" and "reject", and the reviewer edits it before confirming.
 */
export function DecisionPanel({ item }: { item: ApprovalItem }) {
  const decide = useAssistantStore((s) => s.decide);
  const draftComment = useAssistantStore((s) => s.draftComment);
  const [chosen, setChosen] = useState<Decision>();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<'deciding' | 'drafting'>();
  const [error, setError] = useState<string>();
  const [draftSource, setDraftSource] = useState<'ai' | 'template'>();
  const commentId = useId();

  const firstName = item.submittedBy.split(' ')[0] ?? item.submittedBy;
  const choice = CHOICES.find((c) => c.decision === chosen);
  const needsComment = chosen !== undefined && chosen !== 'approve';
  const canConfirm = !busy && (!needsComment || comment.trim().length >= 3);

  const pick = (decision: Decision) => {
    setChosen(decision);
    setError(undefined);
    setDraftSource(undefined);
  };

  const draft = async () => {
    if (!chosen || chosen === 'approve') return;
    setBusy('drafting');
    setError(undefined);
    const result = await draftComment(item.id, chosen, comment);
    setBusy(undefined);
    if ('kind' in result) return setError(result.message);
    setComment(result.comment);
    setDraftSource(result.source);
  };

  const confirm = async () => {
    if (!chosen) return;
    setBusy('deciding');
    setError(undefined);
    const failure = await decide(item.id, chosen, comment);
    setBusy(undefined);
    if (failure) setError(failure.message);
  };

  if (!choice) {
    return (
      <div className="flex flex-wrap gap-3" role="group" aria-label="Decision">
        {CHOICES.map(({ decision, label, icon: Icon, tone }) => (
          <button
            key={decision}
            type="button"
            onClick={() => pick(decision)}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${tone}`}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4">
      <label htmlFor={commentId} className="text-xs font-medium text-slate-600">
        Comment to {firstName} {needsComment ? '(required)' : '(optional)'}
      </label>
      <textarea
        id={commentId}
        value={comment}
        maxLength={1000}
        rows={4}
        onChange={(e) => {
          setComment(e.target.value);
          setDraftSource(undefined);
        }}
        placeholder={
          needsComment ? 'What needs fixing? Short notes are fine; "Draft with AI" can turn them into a message.' : ''
        }
        className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-violet-400 focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-100"
      />
      {draftSource && (
        <p className="text-xs font-medium text-violet-700">
          {draftSource === 'ai'
            ? 'AI draft, check it before sending'
            : 'Standard draft (AI unavailable), check it before sending'}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {needsComment && (
          <button
            type="button"
            onClick={() => void draft()}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-60"
          >
            <Sparkles aria-hidden="true" className="size-3.5" />
            {busy === 'drafting' ? 'Drafting…' : 'Draft with AI'}
          </button>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setChosen(undefined)}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={!canConfirm}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${choice.tone}`}
        >
          {busy === 'deciding' ? 'Saving…' : choice.confirm}
        </button>
      </div>
    </div>
  );
}
