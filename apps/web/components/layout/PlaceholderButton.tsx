'use client';

import { useId, type ReactNode } from 'react';

const NOTE = 'Not part of this demo';

/**
 * A control for a page this demo doesn't have (the reference dashboard shows it, so the layout keeps it).
 * It stays focusable and says why it does nothing, instead of looking broken or silently failing.
 */
export function PlaceholderButton({
  label,
  className,
  children,
}: {
  /** Accessible name; defaults to the visible text. */
  label?: string;
  className: string;
  children: ReactNode;
}) {
  const noteId = useId();
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled="true"
      aria-describedby={noteId}
      title={NOTE}
      onClick={(event) => event.preventDefault()}
      className={`cursor-not-allowed opacity-60 ${className}`}
    >
      {children}
      <span id={noteId} className="sr-only">
        {NOTE}
      </span>
    </button>
  );
}
