'use client';

import { GraduationCap, LifeBuoy, ListOrdered, MessagesSquare, type LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useAssistantStore, type View } from '@/store/assistantStore';

interface ActionCard {
  view: Exclude<View, 'home'>;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind classes for the icon tile: background and icon colour. */
  tone: string;
}

export const ACTION_CARDS: readonly ActionCard[] = [
  {
    view: 'summary',
    title: 'Present me Summary',
    description: 'The queue, most urgent first',
    icon: ListOrdered,
    tone: 'bg-orange-100 text-orange-600',
  },
  {
    view: 'talk',
    title: 'Talk to me',
    description: 'Chat about your approvals',
    icon: MessagesSquare,
    tone: 'bg-sky-100 text-sky-600',
  },
  {
    view: 'help',
    title: 'Help me',
    description: 'Answers from the policy',
    icon: LifeBuoy,
    tone: 'bg-emerald-100 text-emerald-600',
  },
  {
    view: 'teach',
    title: 'Teach me',
    description: 'How to review, step by step',
    icon: GraduationCap,
    tone: 'bg-violet-100 text-violet-600',
  },
];

/** The 2×2 grid of actions. `focusView` returns focus to the card the user came back from. */
export function HomeView({ focusView }: { focusView?: View }) {
  const setView = useAssistantStore((s) => s.setView);
  const runSummary = useAssistantStore((s) => s.runSummary);
  const cardRefs = useRef(new Map<View, HTMLButtonElement>());

  useEffect(() => {
    if (focusView) cardRefs.current.get(focusView)?.focus();
  }, [focusView]);

  const choose = (view: ActionCard['view']) => {
    setView(view);
    if (view === 'summary') void runSummary();
  };

  return (
    <div className="grid grid-cols-2 gap-3 px-4 py-3">
      {ACTION_CARDS.map(({ view, title, description, icon: Icon, tone }) => (
        <button
          key={view}
          type="button"
          ref={(el) => {
            if (el) cardRefs.current.set(view, el);
          }}
          onClick={() => choose(view)}
          className="group flex flex-col items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 py-5 text-center transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
        >
          <span className={`grid size-16 place-items-center rounded-full transition group-hover:scale-105 ${tone}`}>
            <Icon aria-hidden="true" className="size-8" strokeWidth={1.75} />
          </span>
          <span className="text-sm font-semibold text-slate-900">{title}</span>
          <span className="text-xs leading-snug text-slate-500">{description}</span>
        </button>
      ))}
    </div>
  );
}
