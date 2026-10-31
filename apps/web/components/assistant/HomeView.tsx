'use client';

import { GraduationCap, LifeBuoy, ListOrdered, MessageCircle, type LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useAssistantStore, type View } from '@/store/assistantStore';

interface ActionCard {
  view: Exclude<View, 'home'>;
  title: string;
  description: string;
  icon: LucideIcon;
}

export const ACTION_CARDS: readonly ActionCard[] = [
  { view: 'summary', title: 'Present me Summary', description: 'The queue, most urgent first', icon: ListOrdered },
  { view: 'talk', title: 'Talk to me', description: 'Chat about your approvals', icon: MessageCircle },
  { view: 'help', title: 'Help me', description: 'Answers from the policy', icon: LifeBuoy },
  { view: 'teach', title: 'Teach me', description: 'How to review, step by step', icon: GraduationCap },
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
      {ACTION_CARDS.map(({ view, title, description, icon: Icon }) => (
        <button
          key={view}
          type="button"
          ref={(el) => {
            if (el) cardRefs.current.set(view, el);
          }}
          onClick={() => choose(view)}
          className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-orange-300 hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
        >
          <span className="grid size-9 place-items-center rounded-lg bg-orange-50 text-orange-600">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <span className="text-sm font-semibold text-slate-900">{title}</span>
          <span className="text-xs text-slate-500">{description}</span>
        </button>
      ))}
    </div>
  );
}
