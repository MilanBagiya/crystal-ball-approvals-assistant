import { StreamEventSchema, type StreamEvent } from '@approvals/contracts';
import type { z } from 'zod';

export type FailureKind = 'rate_limited' | 'bad_request' | 'server' | 'network' | 'timeout' | 'aborted';

export interface RequestFailure {
  kind: FailureKind;
  message: string;
}

export type StreamOutcome = { ok: true } | { ok: false; error: RequestFailure };
export type JsonOutcome<T> = { ok: true; data: T } | { ok: false; error: RequestFailure };

// What the user sees. Server details never reach the UI.
const MESSAGES: Record<FailureKind, string> = {
  rate_limited: 'Too many requests, please wait a moment.',
  bad_request: 'Something went wrong. Please try again.',
  server: 'Something went wrong. Please try again.',
  network: "Can't reach the assistant. Check your connection and try again.",
  timeout: 'The assistant stopped responding. Please try again.',
  aborted: 'Cancelled.',
};

const failure = (kind: FailureKind, message = MESSAGES[kind]) => ({ ok: false as const, error: { kind, message } });

function kindForStatus(status: number): FailureKind {
  if (status === 429) return 'rate_limited';
  if (status >= 400 && status < 500) return 'bad_request';
  return 'server';
}

/**
 * Incremental SSE parser. Frames end with a blank line; each `data:` payload is parsed as JSON and checked
 * against StreamEventSchema. Anything that doesn't match the contract is dropped: the UI never trusts raw text.
 */
export function createSseParser() {
  let buffer = '';
  return {
    push(chunk: string): StreamEvent[] {
      buffer += chunk.replace(/\r\n/g, '\n');
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      return frames.flatMap((frame) => {
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data) return [];
        try {
          const parsed = StreamEventSchema.safeParse(JSON.parse(data));
          return parsed.success ? [parsed.data] : [];
        } catch {
          return [];
        }
      });
    },
  };
}

interface RequestOptions {
  sessionId: string;
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
}

const headers = (sessionId: string, accept: string) => ({
  'content-type': 'application/json',
  accept,
  'x-session-id': sessionId,
});

/**
 * POSTs to an SSE endpoint and calls `onEvent` for each valid event as it arrives.
 * Always settles: if nothing arrives for `idleTimeoutMs`, or the stream ends without `done`, it reports an error
 * so the panel can show Retry instead of freezing.
 */
export async function postStream(
  path: string,
  body: unknown,
  options: RequestOptions & { onEvent: (event: StreamEvent) => void; idleTimeoutMs?: number },
): Promise<StreamOutcome> {
  const { sessionId, signal, onEvent, idleTimeoutMs = 15_000, fetchFn = fetch } = options;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  let timedOut = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, idleTimeoutMs);
  };

  const stopped = (): StreamOutcome | undefined => {
    if (timedOut) return failure('timeout');
    if (signal?.aborted) return failure('aborted');
    return undefined;
  };

  resetIdle();
  try {
    const response = await fetchFn(path, {
      method: 'POST',
      headers: headers(sessionId, 'text/event-stream'),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return failure(kindForStatus(response.status));
    if (!response.body) return failure('server');

    const reader = response.body.getReader();
    // Cancelling the reader unblocks a pending read() when we time out or the caller aborts.
    controller.signal.addEventListener('abort', () => void reader.cancel().catch(() => undefined), { once: true });

    const decoder = new TextDecoder();
    const parser = createSseParser();
    let sawDone = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdle();
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        if (event.type === 'done') sawDone = true;
        onEvent(event);
      }
    }

    return stopped() ?? (sawDone ? { ok: true } : failure('network', 'The connection dropped. Please try again.'));
  } catch {
    return stopped() ?? failure('network');
  } finally {
    clearTimeout(idleTimer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

/** POSTs JSON and validates the response body against `schema` before returning it. */
export async function postJson<S extends z.ZodType>(
  path: string,
  body: unknown,
  schema: S,
  options: RequestOptions & { timeoutMs?: number },
): Promise<JsonOutcome<z.output<S>>> {
  const { sessionId, signal, fetchFn = fetch, timeoutMs = 15_000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const response = await fetchFn(path, {
      method: 'POST',
      headers: headers(sessionId, 'application/json'),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return failure(kindForStatus(response.status));
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? { ok: true, data: parsed.data } : failure('server');
  } catch {
    if (signal?.aborted) return failure('aborted');
    return failure(controller.signal.aborted ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}
