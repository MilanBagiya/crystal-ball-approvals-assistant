import { vi } from 'vitest';

// A fetch Response whose body the test controls: push SSE frames one at a time, then close or fail it.
export function controllableStream() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    pushRaw: (text: string) => controller.enqueue(encoder.encode(text)),
    push: (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)),
    close: () => controller.close(),
  };
}

export const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fetch mock whose calls can be inspected; each call gets the next queued response (or rejection). */
export function mockFetch(...responses: (Response | Error | (() => Response))[]) {
  const queue = [...responses];
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const next = queue.shift();
    if (!next) throw new Error('mockFetch: no response queued');
    if (next instanceof Error) throw next;
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return typeof next === 'function' ? next() : next;
  });
}

/** Lets pending promise callbacks (stream reads, state updates) run. */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
