'use client';

import { SendHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAssistantStore, type Mode, type UiMessage } from '@/store/assistantStore';
import { ErrorNotice, FallbackNotice, StreamingCaret, TypingDots } from './StatusParts';

const INTROS: Record<Mode, string> = {
  talk: 'Ask anything about your approvals queue, like what to review first or how two items compare.',
  help: 'Ask an operational question. Answers come only from the approval policy.',
  teach: 'Ask how to review an approval and I will walk you through it step by step.',
};

const PLACEHOLDERS: Record<Mode, string> = {
  talk: 'What should I review first?',
  help: 'Who do I escalate an expired calibration to?',
  teach: 'How do I review an approval?',
};

function MessageBubble({ message, streaming }: { message: UiMessage; streaming: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[#16294d] px-3 py-2 text-sm whitespace-pre-wrap text-white">
        {message.content}
      </div>
    );
  }
  return (
    <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-800">
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
            <span key={id} className="rounded bg-white px-1.5 py-0.5 font-mono ring-1 ring-slate-200">
              {id}
            </span>
          ))}
        </p>
      )}
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
        {messages.length === 0 && <p className="text-sm text-slate-500">{INTROS[mode]}</p>}
        {messages.map((message) =>
          message === last && waitingForFirstEvent ? null : (
            <MessageBubble key={message.id} message={message} streaming={busy && message === last} />
          ),
        )}
        {waitingForFirstEvent && <TypingDots />}
        <div ref={endRef} />
      </div>

      {status === 'error' && error && (
        <div className="px-4 pb-2">
          <ErrorNotice message={error.message} onRetry={() => void retry()} />
        </div>
      )}

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-slate-200 px-3 py-3">
        <input
          type="text"
          aria-label="Message"
          value={draft}
          maxLength={2000}
          placeholder={PLACEHOLDERS[mode]}
          onChange={(e) => setDraft(e.target.value)}
          className="min-w-0 flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm focus:border-[#16294d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16294d]/30"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!draft.trim() || busy}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-orange-500 text-white hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <SendHorizontal aria-hidden="true" className="size-4" />
        </button>
      </form>
    </div>
  );
}
