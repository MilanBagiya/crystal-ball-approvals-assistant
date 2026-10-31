import { resetAssistantStore, useAssistantStore } from '@/store/assistantStore';
import { controllableStream, flush, jsonResponse, mockFetch } from './helpers/fakeFetch';

const store = () => useAssistantStore.getState();
const lastBody = (fetchFn: ReturnType<typeof mockFetch>) =>
  JSON.parse(String(fetchFn.mock.calls.at(-1)?.[1]?.body)) as Record<string, unknown>;

beforeEach(() => {
  resetAssistantStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chat conversations', () => {
  it('adds the user message and grows the assistant reply token by token', async () => {
    const stream = controllableStream();
    const fetchFn = mockFetch(stream.response);
    vi.stubGlobal('fetch', fetchFn);

    const sending = store().sendMessage('talk', 'What should I review first?');
    expect(store().status).toBe('loading');

    stream.push({ type: 'token', text: 'Start with ' });
    await flush();
    expect(store().status).toBe('streaming');
    stream.push({ type: 'token', text: 'the safety specs.' });
    stream.push({ type: 'done' });
    stream.close();
    await sending;

    expect(store().conversations.talk.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: 'user', content: 'What should I review first?' },
      { role: 'assistant', content: 'Start with the safety specs.' },
    ]);
    expect(store().status).toBe('done');
    expect(lastBody(fetchFn)).toEqual({
      mode: 'talk',
      messages: [{ role: 'user', content: 'What should I review first?' }],
    });
  });

  it('attaches a fallback to the reply and marks the status as fallback', async () => {
    const stream = controllableStream();
    vi.stubGlobal('fetch', mockFetch(stream.response));

    const sending = store().sendMessage('teach', 'Teach me');
    stream.push({ type: 'fallback', reason: 'no_api_key', content: '1. Check the deadline.' });
    stream.push({ type: 'done' });
    stream.close();
    await sending;

    expect(store().conversations.teach.at(-1)).toMatchObject({
      role: 'assistant',
      content: '',
      fallback: { reason: 'no_api_key', content: '1. Check the deadline.' },
    });
    expect(store().status).toBe('fallback');
    expect(store().fallbackReason).toBe('no_api_key');
  });

  it('on error, drops the empty reply and keeps the question so Retry can resend it once', async () => {
    const fetchFn = mockFetch(jsonResponse(500, {}), controllableStream().response);
    vi.stubGlobal('fetch', fetchFn);

    await store().sendMessage('talk', 'Hello?');

    expect(store().status).toBe('error');
    expect(store().error?.message).toBe('Something went wrong. Please try again.');
    expect(store().conversations.talk.map((m) => m.role)).toEqual(['user']);

    void store().retry();
    await flush();

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(lastBody(fetchFn)).toEqual({ mode: 'talk', messages: [{ role: 'user', content: 'Hello?' }] });
    expect(store().conversations.talk.filter((m) => m.role === 'user')).toHaveLength(1);
  });

  it("keeps history within the server's limits: last 20 messages, 2000 characters each", async () => {
    vi.stubGlobal('fetch', mockFetch(controllableStream().response));
    const long = 'x'.repeat(3000);
    useAssistantStore.setState({
      conversations: {
        ...store().conversations,
        talk: Array.from({ length: 30 }, (_, i) => ({
          id: `m${i}`,
          role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
          content: i % 2 === 0 ? `question ${i}` : long,
        })),
      },
    });

    void store().sendMessage('talk', 'Latest question');
    await flush();

    const messages = (lastBody(vi.mocked(fetch)) as { messages: { role: string; content: string }[] }).messages;
    expect(messages).toHaveLength(20);
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Latest question' });
    expect(Math.max(...messages.map((m) => m.content.length))).toBe(2000);
  });

  it('sends Help questions with the earlier turns as history', async () => {
    const fetchFn = mockFetch(controllableStream().response);
    vi.stubGlobal('fetch', fetchFn);
    useAssistantStore.setState({
      conversations: {
        ...store().conversations,
        help: [
          { id: '1', role: 'user', content: 'What is the SLA?' },
          { id: '2', role: 'assistant', content: '72 hours.' },
        ],
      },
    });

    void store().sendMessage('help', 'And for safety items?');
    await flush();

    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/ai/help');
    expect(lastBody(fetchFn)).toEqual({
      question: 'And for safety items?',
      messages: [
        { role: 'user', content: 'What is the SLA?' },
        { role: 'assistant', content: '72 hours.' },
      ],
    });
  });

  it('cancels the previous request when a new one starts', async () => {
    const fetchFn = mockFetch(controllableStream().response, controllableStream().response);
    vi.stubGlobal('fetch', fetchFn);

    void store().sendMessage('talk', 'First');
    await flush();
    void store().runSummary();
    await flush();

    expect(fetchFn.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});

describe('summary', () => {
  it('collects the headline and keeps items in rank order whatever order they arrive in', async () => {
    const stream = controllableStream();
    vi.stubGlobal('fetch', mockFetch(stream.response));

    const running = store().runSummary();
    stream.push({ type: 'summary_headline', text: '4 items.', pendingCount: 4, source: 'ai' });
    stream.push({ type: 'summary_item', id: 'a2', rank: 2, urgency: 'medium', reason: 'r2', source: 'ai' });
    stream.push({ type: 'summary_item', id: 'a3', rank: 1, urgency: 'high', reason: 'r1', source: 'fallback' });
    stream.push({ type: 'done' });
    stream.close();
    await running;

    expect(store().summary.headline?.text).toBe('4 items.');
    expect(store().summary.items.map((i) => i.id)).toEqual(['a3', 'a2']);
    expect(store().status).toBe('done');
  });
});

describe('greeting', () => {
  it('loads the greeting with the local time', async () => {
    const fetchFn = mockFetch(jsonResponse(200, { greeting: 'Good morning! 4 items.', source: 'ai' }));
    vi.stubGlobal('fetch', fetchFn);

    await store().loadGreeting();

    expect(store().greeting).toEqual({ text: 'Good morning! 4 items.', source: 'ai', status: 'done' });
    expect(lastBody(fetchFn).localTime).toMatch(/^\d{2}:\d{2}$/);
  });

  it('shows a generic greeting if the request fails, so the panel is never blank', async () => {
    vi.stubGlobal('fetch', mockFetch(new TypeError('Failed to fetch')));

    await store().loadGreeting();

    expect(store().greeting.status).toBe('error');
    expect(store().greeting.text).toMatch(/Approvals assistant/);
  });
});
