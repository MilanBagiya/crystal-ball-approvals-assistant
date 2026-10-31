'use client';

import { Bot, SendHorizontal, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAssistantStore, type Mode, type UiMessage } from '@/store/assistantStore';
import { ErrorNotice, FallbackNotice, StreamingCaret, TypingDots } from './StatusParts';

const INTROS: Record<Mode, string> = {
  talk: 'Ask anything about your approvals queue, like what to review first or how two items compare.',
  help: 'Ask an operational question. Answers come only from the approval policy.',
  teach: 'Ask how to review an approval and I will walk you through it step by step.',
};

// Starter questions shown in an empty conversation, so the first step is one click.
const SUGGESTIONS: Record<Mode, readonly string[]> = {
  talk: ['What should I review first?', 'Why is the safety specs item first?', 'Which items did Sam submit?'],
  help: [
    'Who do I escalate an expired calibration to?',
    'What is the review SLA for safety documents?',
    'When should I reject an item?',
  ],
  teach: ['How do I review an approval?', 'How do I check a safety spec?', 'When should I request changes?'],
};

function AssistantAvatar() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-700"
    >
      <Bot className="size-4" />
    </span>
  );
}

function MessageBubble({ message, streaming }: { message: UiMessage; streaming: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[#0f1f3d] px-3.5 py-2 text-sm whitespace-pre-wrap text-white shadow-sm">
        {message.content}
      </div>
    );
  }
  return (
    <div className="flex max-w-[92%] gap-2">
      <AssistantAvatar />
      <div className="min-w-0 rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2 text-sm leading-relaxed text-slate-800">
        {message.content && (
          <p className="whitespace-pre-wrap">
            {message.content}
            {streaming && <StreamingCaret />}
          </p>
        )}
        {message.fallback && (
          <div className={message.content ? 'mt-2 border-t border-slate-200 pt-2' : ''}>
            <FallbackNotice />
            <p className="whitespace-pre-wrap">{message.fallback.content}</p>
          </div>
        )}
        {message.sources && message.sources.length > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-500">
            Sources:
            {message.sources.map((id) => (
              <span key={id} className="rounded-md bg-white px-1.5 py-0.5 font-mono ring-1 ring-slate-200">
                {id}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

export function ChatView({ mode }: { mode: Mode }) {
  const messages = useAssistantStore((s) => s.conversations[mode]);
  const status = useAssistantStore((s) => s.status);
  const error = useAssistantStore((s) => s.error);
  const sendMessage = useAssistantStore((s) => s.sendMessage);
  const retry = useAssistantStore((s) => s.retry);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const busy = status === 'loading' || status === 'streaming';
  const last = messages.at(-1);
  const waitingForFirstEvent = busy && last?.role === 'assistant' && !last.content && !last.fallback;

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, status]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    void sendMessage(mode, draft);
    setDraft('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-500">{INTROS[mode]}</p>
            <div role="group" aria-label="Suggested questions" className="flex flex-col items-start gap-2">
              {SUGGESTIONS[mode].map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void sendMessage(mode, question)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-left text-xs font-medium text-violet-800 transition hover:border-violet-300 hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-violet-500"
                >
                  <Sparkles aria-hidden="true" className="size-3.5 shrink-0" />
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message) =>
          message === last && waitingForFirstEvent ? null : (
            <MessageBubble key={message.id} message={message} streaming={busy && message === last} />
          ),
        )}
        {waitingForFirstEvent && (
          <div className="flex gap-2">
            <AssistantAvatar />
            <TypingDots />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {status === 'error' && error && (
        <div className="px-4 pb-2">
          <ErrorNotice message={error.message} onRetry={() => void retry()} />
        </div>
      )}

      <form onSubmit={submit} className="border-t border-slate-100 bg-white px-3 py-3">
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pr-1 pl-4 focus-within:border-violet-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-violet-100">
          <input
            type="text"
            aria-label="Message"
            value={draft}
            maxLength={2000}
            placeholder="Type your question…"
            onChange={(e) => setDraft(e.target.value)}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!draft.trim() || busy}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-orange-500 text-white transition hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <SendHorizontal aria-hidden="true" className="size-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
