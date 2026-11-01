'use client';

import { ArrowUpRight, Bot, Home, Info, Maximize2, Minimize2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PlaceholderButton } from '@/components/layout/PlaceholderButton';
import { useAssistantStore, type View } from '@/store/assistantStore';
import { ActionView } from './ActionView';
import { HomeView } from './HomeView';
import { TypingDots } from './StatusParts';

function Greeting() {
  const greeting = useAssistantStore((s) => s.greeting);
  return (
    <div aria-live="polite" className="px-4 pt-3">
      {greeting.status === 'loading' || greeting.status === 'idle' ? (
        <TypingDots label="Loading greeting" />
      ) : (
        <p className="rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-sm text-slate-800">{greeting.text}</p>
      )}
    </div>
  );
}

function FloatingButton() {
  const open = useAssistantStore((s) => s.open);
  return (
    <button
      type="button"
      aria-label="Open Approvals assistant"
      onClick={open}
      // Only rendered after the panel was closed, so taking focus here returns it to where the user was.
      autoFocus
      className="fixed right-4 bottom-4 z-50 grid size-14 place-items-center rounded-full bg-[#0f1f3d] text-white shadow-lg hover:bg-[#16294d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 sm:right-6 sm:bottom-6"
    >
      <Bot aria-hidden="true" className="size-6" />
    </button>
  );
}

export function AssistantPanel() {
  const isOpen = useAssistantStore((s) => s.isOpen);
  const view = useAssistantStore((s) => s.view);
  const close = useAssistantStore((s) => s.close);
  const greetingStatus = useAssistantStore((s) => s.greeting.status);
  const loadGreeting = useAssistantStore((s) => s.loadGreeting);
  const approvals = useAssistantStore((s) => s.approvals);
  const loadApprovals = useAssistantStore((s) => s.loadApprovals);
  const [expanded, setExpanded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // Remember which action view we left, so Home can return focus to that card.
  const previousView = useRef<View>(view);
  const [returnFocusTo, setReturnFocusTo] = useState<View>();
  useEffect(() => {
    if (view === 'home' && previousView.current !== 'home') setReturnFocusTo(previousView.current);
    previousView.current = view;
  }, [view]);

  useEffect(() => {
    if (approvals.status === 'idle') void loadApprovals();
  }, [approvals.status, loadApprovals]);

  // The greeting loads when the panel is first opened.
  useEffect(() => {
    if (isOpen && greetingStatus === 'idle') void loadGreeting();
  }, [isOpen, greetingStatus, loadGreeting]);

  if (!isOpen) return <FloatingButton />;

  const pendingCount = approvals.items.filter((item) => item.status === 'pending_review').length;
  const count = approvals.status === 'done' ? `${pendingCount} items` : 'Loading items…';
  // Home fits its content; chat and summary get a fixed height so the conversation has room to scroll.
  const width = expanded ? 'sm:w-[560px]' : 'sm:w-[400px]';
  const height = view === 'home' ? '' : expanded ? 'h-[85dvh]' : 'h-[600px]';

  return (
    <section
      role="dialog"
      aria-label="Approvals assistant"
      className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-slate-200 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:rounded-2xl ${width} ${height}`}
    >
      <header className="flex items-center gap-3 bg-[#0f1f3d] px-4 py-3 text-white">
        <span className="grid size-9 place-items-center rounded-full bg-white/15">
          <Bot aria-hidden="true" className="size-5" />
        </span>
        <h2 className="flex-1 text-base font-semibold">Approvals</h2>
        <button
          type="button"
          aria-label="About this assistant"
          aria-expanded={showInfo}
          onClick={() => setShowInfo((v) => !v)}
          className="grid size-8 place-items-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
        >
          <Info aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          aria-label={expanded ? 'Shrink panel' : 'Expand panel'}
          aria-pressed={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="hidden size-8 place-items-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white sm:grid"
        >
          {expanded ? (
            <Minimize2 aria-hidden="true" className="size-4" />
          ) : (
            <Maximize2 aria-hidden="true" className="size-4" />
          )}
        </button>
        <button
          type="button"
          aria-label="Close assistant"
          onClick={close}
          className="grid size-8 place-items-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>

      {showInfo && (
        <p className="bg-slate-50 px-4 py-2 text-xs text-slate-600">
          Answers come from your approvals queue and the approval policy. The queue order is fixed by a documented rule;
          the AI only explains it. If the AI is unavailable you&apos;ll see a standard answer instead.
        </p>
      )}

      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-sm">
        <span className="flex items-center gap-1.5 font-medium text-slate-700">
          <Home aria-hidden="true" className="size-4" />
          Approvals
        </span>
        <button
          type="button"
          onClick={() => void loadGreeting()}
          className="font-medium text-orange-600 hover:text-orange-700 focus-visible:outline-2 focus-visible:outline-orange-500"
        >
          Replay Greeting
        </button>
      </div>

      {/* The greeting belongs to the home view; action views use the space for the conversation. */}
      {view === 'home' && <Greeting />}

      {view === 'home' ? <HomeView focusView={returnFocusTo} /> : <ActionView view={view} />}

      <footer className="mt-auto flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        <span>{count}</span>
        <PlaceholderButton className="inline-flex items-center gap-0.5 font-medium text-slate-700">
          HMS Panel
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </PlaceholderButton>
      </footer>
    </section>
  );
}
