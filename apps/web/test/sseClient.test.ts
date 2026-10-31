import { GreetingResponseSchema, type StreamEvent } from '@approvals/contracts';
import { createSseParser, postJson, postStream } from '@/lib/sseClient';
import { controllableStream, flush, jsonResponse, mockFetch } from './helpers/fakeFetch';

const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;

describe('createSseParser', () => {
  it('only emits an event once its frame is complete, even when split across chunks', () => {
    const parser = createSseParser();
    const text = frame({ type: 'token', text: 'Hello' });

    expect(parser.push(text.slice(0, 10))).toEqual([]);
    expect(parser.push(text.slice(10, 20))).toEqual([]);
    expect(parser.push(text.slice(20))).toEqual([{ type: 'token', text: 'Hello' }]);
  });

  it('emits several events from one chunk, in order', () => {
    const parser = createSseParser();

    expect(parser.push(frame({ type: 'token', text: 'a' }) + frame({ type: 'done' }))).toEqual([
      { type: 'token', text: 'a' },
      { type: 'done' },
    ]);
  });

  it('ignores invalid JSON and events that fail the contract, and keeps parsing', () => {
    const parser = createSseParser();
    const chunk =
      'data: {not json\n\n' +
      frame({ type: 'debug', secret: 'x' }) +
      frame({ type: 'fallback', reason: 'made_up', content: 'x' }) +
      frame({ type: 'token', text: 'ok' });

    expect(parser.push(chunk)).toEqual([{ type: 'token', text: 'ok' }]);
  });

  it('handles CRLF line endings and skips comment lines', () => {
    const parser = createSseParser();

    expect(parser.push(': keep-alive\r\n\r\ndata: {"type":"done"}\r\n\r\n')).toEqual([{ type: 'done' }]);
  });
});

describe('postStream', () => {
  async function run(
    fetchFn: ReturnType<typeof mockFetch>,
    options: { idleTimeoutMs?: number; signal?: AbortSignal } = {},
  ) {
    const events: StreamEvent[] = [];
    const outcome = postStream(
      '/api/ai/summary',
      { language: 'en' },
      {
        sessionId: 'session-1234',
        onEvent: (e) => events.push(e),
        fetchFn,
        ...options,
      },
    );
    return { events, outcome };
  }

  it('POSTs JSON with the session header and delivers events as they arrive', async () => {
    const stream = controllableStream();
    const fetchFn = mockFetch(stream.response);
    const { events, outcome } = await run(fetchFn);

    stream.push({ type: 'token', text: 'Hel' });
    await flush();
    expect(events).toEqual([{ type: 'token', text: 'Hel' }]); // delivered before the stream ends

    stream.push({ type: 'done' });
    stream.close();

    await expect(outcome).resolves.toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/ai/summary');
    expect(init).toMatchObject({ method: 'POST', body: '{"language":"en"}' });
    expect(new Headers(init?.headers).get('x-session-id')).toBe('session-1234');
  });

  it.each([
    [429, 'rate_limited', 'Too many requests, please wait a moment.'],
    [400, 'bad_request', 'Something went wrong. Please try again.'],
    [500, 'server', 'Something went wrong. Please try again.'],
  ])('maps HTTP %i to a friendly %s error', async (status, kind, message) => {
    const { outcome } = await run(mockFetch(jsonResponse(status, { error: { code: 'x', message: 'raw detail' } })));

    await expect(outcome).resolves.toEqual({ ok: false, error: { kind, message } });
  });

  it('maps a network failure to a network error', async () => {
    const { outcome } = await run(mockFetch(new TypeError('Failed to fetch')));

    await expect(outcome).resolves.toMatchObject({ ok: false, error: { kind: 'network' } });
  });

  it('treats a stream that ends without done as a dropped connection, so the UI never waits forever', async () => {
    const stream = controllableStream();
    const { outcome } = await run(mockFetch(stream.response));

    stream.push({ type: 'token', text: 'Partial' });
    stream.close();

    await expect(outcome).resolves.toMatchObject({ ok: false, error: { kind: 'network' } });
  });

  it('gives up with a timeout error after the idle timeout with no events', async () => {
    const stream = controllableStream();
    const fetchFn = mockFetch(stream.response);
    const { outcome } = await run(fetchFn, { idleTimeoutMs: 30 });

    stream.push({ type: 'token', text: 'a' });

    await expect(outcome).resolves.toEqual({
      ok: false,
      error: { kind: 'timeout', message: 'The assistant stopped responding. Please try again.' },
    });
    expect(fetchFn.mock.calls[0]?.[1]?.signal?.aborted).toBe(true); // the request is cancelled too
  });

  it('reports an abort by the caller as aborted, not as an error to show', async () => {
    const stream = controllableStream();
    const controller = new AbortController();
    const { outcome } = await run(mockFetch(stream.response), { signal: controller.signal });

    controller.abort();

    await expect(outcome).resolves.toMatchObject({ ok: false, error: { kind: 'aborted' } });
  });
});

describe('postJson', () => {
  it('returns the body when it matches the schema', async () => {
    const fetchFn = mockFetch(jsonResponse(200, { greeting: 'Hi! 4 items.', source: 'ai' }));

    await expect(
      postJson('/api/ai/greeting', {}, GreetingResponseSchema, { sessionId: 'session-1234', fetchFn }),
    ).resolves.toEqual({ ok: true, data: { greeting: 'Hi! 4 items.', source: 'ai' } });
  });

  it('never trusts a body that fails the schema', async () => {
    const fetchFn = mockFetch(jsonResponse(200, { greeting: 42 }));

    await expect(
      postJson('/api/ai/greeting', {}, GreetingResponseSchema, { sessionId: 'session-1234', fetchFn }),
    ).resolves.toMatchObject({ ok: false, error: { kind: 'server' } });
  });
});
