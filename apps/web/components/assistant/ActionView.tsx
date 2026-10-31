'use client';

import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useAssistantStore, type View } from '@/store/assistantStore';
import { ChatView } from './ChatView';
import { ACTION_CARDS } from './HomeView';
import { SummaryView } from './SummaryView';

export function ActionView({ view }: { view: Exclude<View, 'home'> }) {
  const setView = useAssistantStore((s) => s.setView);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const title = ACTION_CARDS.find((card) => card.view === view)?.title ?? '';

  // Move focus to the new view's heading so keyboard and screen reader users land in the right place.
  useEffect(() => {
    headingRef.current?.focus();
  }, [view]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <button
          type="button"
          aria-label="Back to home"
          onClick={() => setView('home')}
          className="grid size-8 place-items-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-orange-500"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
        </button>
        <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-slate-900 focus:outline-none">
          {title}
        </h2>
      </div>
      {view === 'summary' ? <SummaryView /> : <ChatView mode={view} />}
    </div>
  );
}
