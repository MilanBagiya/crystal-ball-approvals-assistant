import {
  ApprovalsResponseSchema,
  GreetingResponseSchema,
  CommentDraftResponseSchema,
  DecisionResponseSchema,
  ReviewResponseSchema,
  type ApprovalItem,
  type CommentDraftResponse,
  type Decision,
  type ReviewResponse,
  type ChatMessage,
  type FallbackReason,
  type StreamEvent,
  type SummaryHeadlineEvent,
  type SummaryItemEvent,
} from '@approvals/contracts';
import { create } from 'zustand';
import { getJson, postJson, postStream, type RequestFailure } from '@/lib/sseClient';

export type Mode = 'talk' | 'help' | 'teach';
export type View = 'home' | 'summary' | Mode;
export type Status = 'idle' | 'loading' | 'streaming' | 'done' | 'error' | 'fallback';

export interface Fallback {
  reason: FallbackReason;
  content: string;
}

export interface UiMessage extends ChatMessage {
  id: string;
  fallback?: Fallback;
  sources?: string[];
}

export interface SummaryState {
  headline?: SummaryHeadlineEvent;
  items: SummaryItemEvent[];
  fallback?: Fallback;
}

export interface GreetingState {
  text: string;
  source?: 'ai' | 'template';
  status: 'idle' | 'loading' | 'done' | 'error';
}

export interface ApprovalsState {
  items: ApprovalItem[];
  status: 'idle' | 'loading' | 'done' | 'error';
}

export interface ReviewState {
  status: 'loading' | 'done' | 'error';
  data?: ReviewResponse;
  error?: RequestFailure;
}

interface AssistantData {
  isOpen: boolean;
  approvals: ApprovalsState;
  /** AI pre-review results, per item id. */
  reviews: Record<string, ReviewState>;
  view: View;
  greeting: GreetingState;
  conversations: Record<Mode, UiMessage[]>;
  summary: SummaryState;
  status: Status;
  fallbackReason?: FallbackReason;
  error?: RequestFailure;
  lastAction?: { kind: 'summary' } | { kind: 'chat'; mode: Mode };
}

interface AssistantActions {
  open(): void;
  close(): void;
  loadApprovals(): Promise<void>;
  setView(view: View): void;
  loadGreeting(): Promise<void>;
  runSummary(): Promise<void>;
  sendMessage(mode: Mode, text: string): Promise<void>;
  retry(): Promise<void>;
  /** Records a reviewer decision; resolves to an error to show, or undefined on success. */
  decide(id: string, decision: Decision, comment?: string): Promise<RequestFailure | undefined>;
  runReview(id: string): Promise<void>;
  draftComment(
    id: string,
    decision: Exclude<Decision, 'approve'>,
    notes: string,
  ): Promise<CommentDraftResponse | RequestFailure>;
}

export type AssistantState = AssistantData & AssistantActions & { readonly sessionId: string };

// Server limits from ChatRequestSchema / HelpRequestSchema. History is trimmed to fit, so a long
// earlier reply can never turn the next request into a 400.
const MAX_CHAT_MESSAGES = 20;
const MAX_HELP_HISTORY = 10;
const MAX_MESSAGE_CHARS = 2000;
const GENERIC_GREETING = "Hi! I'm your Approvals assistant. Pick an option below to get started.";

const initialData = (): AssistantData => ({
  isOpen: true,
  approvals: { items: [], status: 'idle' },
  reviews: {},
  view: 'home',
  greeting: { text: '', status: 'idle' },
  conversations: { talk: [], help: [], teach: [] },
  summary: { items: [] },
  status: 'idle',
});

let nextId = 0;
const newId = () => `m${++nextId}`;

function createSessionId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const localTime = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

/** The operator's language from the browser (e.g. "hi-IN"), so the summary and greeting come back in it. */
export function operatorLanguage(): string {
  const lang = typeof navigator === 'undefined' ? '' : navigator.language;
  // Same bounds as the API's LanguageSchema (2–10 characters); anything odd falls back to English.
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,4})?$/.test(lang ?? '') ? lang : 'en';
}

/** What the user actually saw for a message: model text plus any fallback answer. */
const visibleText = (m: UiMessage) => [m.content, m.fallback?.content].filter(Boolean).join('\n\n');

const toHistory = (messages: readonly UiMessage[], limit: number): ChatMessage[] =>
  messages
    .map((m) => ({ role: m.role, content: visibleText(m).slice(0, MAX_MESSAGE_CHARS) }))
    .filter((m) => m.content.length > 0)
    .slice(-limit);

// One request at a time: starting a new one cancels the previous, and results from a cancelled request are ignored.
let inFlight: AbortController | undefined;
function beginRequest(): AbortController {
  inFlight?.abort();
  inFlight = new AbortController();
  return inFlight;
}

export const useAssistantStore = create<AssistantState>()((set, get) => {
  const sessionId = createSessionId();

  /** Applies a stream event to the last assistant message of a conversation. */
  const applyToReply = (mode: Mode, event: StreamEvent) => {
    set((state) => {
      const messages = [...state.conversations[mode]];
      const last = messages.at(-1);
      if (!last || last.role !== 'assistant') return state;

      let reply = last;
      let status = state.status;
      let fallbackReason = state.fallbackReason;
      if (event.type === 'token') {
        reply = { ...last, content: last.content + event.text };
        if (status === 'loading') status = 'streaming';
      } else if (event.type === 'sources') {
        reply = { ...last, sources: event.chunkIds };
      } else if (event.type === 'fallback') {
        reply = { ...last, fallback: { reason: event.reason, content: event.content } };
        status = 'fallback';
        fallbackReason = event.reason;
      } else if (event.type === 'done') {
        status = status === 'fallback' ? 'fallback' : 'done';
      }
      messages[messages.length - 1] = reply;
      return { conversations: { ...state.conversations, [mode]: messages }, status, fallbackReason };
    });
  };

  const applyToSummary = (event: StreamEvent) => {
    set((state) => {
      const summary = { ...state.summary };
      let status: Status = state.status === 'loading' ? 'streaming' : state.status;
      let fallbackReason = state.fallbackReason;
      if (event.type === 'summary_headline') {
        summary.headline = event;
      } else if (event.type === 'summary_item') {
        summary.items = [...summary.items.filter((i) => i.id !== event.id), event].sort((a, b) => a.rank - b.rank);
      } else if (event.type === 'fallback') {
        summary.fallback = { reason: event.reason, content: event.content };
        status = 'fallback';
        fallbackReason = event.reason;
      } else if (event.type === 'done') {
        status = state.status === 'fallback' ? 'fallback' : 'done';
      }
      return { summary, status, fallbackReason };
    });
  };

  /** Streams the reply for the conversation as it currently stands (the last message is the user's). */
  async function streamReply(mode: Mode): Promise<void> {
    const controller = beginRequest();
    const history = get().conversations[mode];
    const body =
      mode === 'help'
        ? {
            question: history.at(-1)?.content ?? '',
            messages: toHistory(history.slice(0, -1), MAX_HELP_HISTORY),
          }
        : { mode, messages: toHistory(history, MAX_CHAT_MESSAGES) };

    set((state) => ({
      conversations: {
        ...state.conversations,
        [mode]: [...state.conversations[mode], { id: newId(), role: 'assistant', content: '' }],
      },
      status: 'loading',
      error: undefined,
      fallbackReason: undefined,
      lastAction: { kind: 'chat', mode },
    }));

    const outcome = await postStream(mode === 'help' ? '/api/ai/help' : '/api/ai/chat', body, {
      sessionId,
      signal: controller.signal,
      onEvent: (event) => {
        if (inFlight === controller) applyToReply(mode, event);
      },
    });
    if (outcome.ok || inFlight !== controller) return;

    // Failed or cancelled: remove an empty reply placeholder so the conversation ends with the user's message.
    set((state) => {
      const messages = state.conversations[mode];
      const last = messages.at(-1);
      const trimmed = last?.role === 'assistant' && !visibleText(last) ? messages.slice(0, -1) : messages;
      const failed = outcome.error.kind !== 'aborted';
      return {
        conversations: { ...state.conversations, [mode]: trimmed },
        status: failed ? 'error' : 'idle',
        error: failed ? outcome.error : undefined,
      };
    });
  }

  return {
    ...initialData(),
    sessionId,

    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    setView: (view) => {
      inFlight?.abort();
      set({ view, status: 'idle', error: undefined, fallbackReason: undefined });
    },

    async decide(id, decision, comment) {
      const body = { decision, ...(comment?.trim() ? { comment: comment.trim() } : {}) };
      const result = await postJson(`/api/approvals/${encodeURIComponent(id)}/decision`, body, DecisionResponseSchema, {
        sessionId,
      });
      if (!result.ok) return result.error;

      set((state) => ({
        approvals: {
          ...state.approvals,
          items: state.approvals.items.map((item) => (item.id === id ? result.data.item : item)),
        },
        // The queue changed: drop the old summary and refresh the greeting so the counts stay true.
        summary: { items: [] },
      }));
      void get().loadGreeting();
      return undefined;
    },

    async runReview(id) {
      set((state) => ({ reviews: { ...state.reviews, [id]: { status: 'loading' } } }));
      const result = await postJson('/api/ai/review', { itemId: id }, ReviewResponseSchema, { sessionId });
      set((state) => ({
        reviews: {
          ...state.reviews,
          [id]: result.ok ? { status: 'done', data: result.data } : { status: 'error', error: result.error },
        },
      }));
    },

    async draftComment(id, decision, notes) {
      const body = { itemId: id, decision, ...(notes.trim() ? { notes: notes.trim() } : {}) };
      const result = await postJson('/api/ai/comment', body, CommentDraftResponseSchema, { sessionId });
      return result.ok ? result.data : result.error;
    },

    async loadApprovals() {
      if (get().approvals.status === 'loading') return;
      set((state) => ({ approvals: { ...state.approvals, status: 'loading' } }));
      const result = await getJson('/api/approvals', ApprovalsResponseSchema, { sessionId });
      set({ approvals: result.ok ? { items: result.data.items, status: 'done' } : { items: [], status: 'error' } });
    },

    async loadGreeting() {
      set((state) => ({ greeting: { ...state.greeting, status: 'loading' } }));
      const result = await postJson(
        '/api/ai/greeting',
        { localTime: localTime(), language: operatorLanguage() },
        GreetingResponseSchema,
        { sessionId },
      );
      set({
        greeting: result.ok
          ? { text: result.data.greeting, source: result.data.source, status: 'done' }
          : { text: GENERIC_GREETING, status: 'error' },
      });
    },

    async runSummary() {
      const controller = beginRequest();
      set({
        summary: { items: [] },
        status: 'loading',
        error: undefined,
        fallbackReason: undefined,
        lastAction: { kind: 'summary' },
      });

      const outcome = await postStream(
        '/api/ai/summary',
        { language: operatorLanguage() },
        {
          sessionId,
          signal: controller.signal,
          onEvent: (event) => {
            if (inFlight === controller) applyToSummary(event);
          },
        },
      );
      if (outcome.ok || inFlight !== controller) return;

      const failed = outcome.error.kind !== 'aborted';
      set({ status: failed ? 'error' : 'idle', error: failed ? outcome.error : undefined });
    },

    async sendMessage(mode, text) {
      const content = text.trim().slice(0, MAX_MESSAGE_CHARS);
      if (!content) return;
      set((state) => ({
        conversations: {
          ...state.conversations,
          [mode]: [...state.conversations[mode], { id: newId(), role: 'user', content }],
        },
      }));
      await streamReply(mode);
    },

    async retry() {
      const action = get().lastAction;
      if (!action) return;
      if (action.kind === 'summary') await get().runSummary();
      else await streamReply(action.mode);
    },
  };
});

/** Resets all data (not the session id) to its initial state. Used by tests. */
export function resetAssistantStore(): void {
  inFlight?.abort();
  inFlight = undefined;
  useAssistantStore.setState(initialData());
}
