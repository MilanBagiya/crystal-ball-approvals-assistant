'use client';

import { AlertTriangle, Info, RotateCcw } from 'lucide-react';

export function TypingDots({ label = 'Assistant is typing' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex gap-1 px-1 py-2">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          aria-hidden="true"
          className="size-2 animate-bounce rounded-full bg-slate-400"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

export function StreamingCaret() {
  return (
    <span
      data-testid="streaming-caret"
      aria-hidden="true"
      className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-blink bg-slate-700"
    />
  );
}

/** Shown whenever the server sent a non-AI answer. Deliberately low-key: the answer below it is still useful. */
export function FallbackNotice({ partial = false }: { partial?: boolean }) {
  return (
    <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-700">
      <Info aria-hidden="true" className="size-3.5" />
      {/* Partial: the AI answered, but some parts were replaced by standard ones. */}
      {partial ? 'Some parts are standard answers' : 'AI unavailable, showing a standard answer'}
    </p>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="flex-1">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-semibold text-red-800 ring-1 ring-red-200 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-red-600"
      >
        <RotateCcw aria-hidden="true" className="size-3" />
        Retry
      </button>
    </div>
  );
}
