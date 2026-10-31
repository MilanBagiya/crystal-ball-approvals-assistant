import { StreamEventSchema, type FallbackReason, type StreamEvent } from '@approvals/contracts';
import type { Request, Response } from 'express';

export interface SseStream {
  /** Validates the event against the shared contract, then writes one `data:` frame. */
  send(event: StreamEvent): void;
  /** Sends `done` (exactly once) and ends the response. */
  close(): void;
  /** Aborted when the client disconnects, so the LLM call can be cancelled. */
  readonly signal: AbortSignal;
}

// Lets the central error handler finish a stream that is already open.
const openStreams = new WeakMap<Response, SseStream>();

export function getOpenSse(res: Response): SseStream | undefined {
  return openStreams.get(res);
}

export function openSse(_req: Request, res: Response): SseStream {
  const disconnect = new AbortController();
  let closed = false;

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // stop proxies from buffering the stream
  });
  res.flushHeaders();

  // 'close' on the response before we ended it means the client went away.
  res.on('close', () => {
    if (!res.writableEnded) disconnect.abort();
  });

  const write = (event: StreamEvent) => {
    if (closed || disconnect.signal.aborted) return;
    res.write(`data: ${JSON.stringify(StreamEventSchema.parse(event))}\n\n`);
  };

  const stream: SseStream = {
    send: write,
    close() {
      if (closed) return;
      write({ type: 'done' });
      closed = true;
      openStreams.delete(res);
      res.end();
    },
    signal: disconnect.signal,
  };
  openStreams.set(res, stream);
  return stream;
}

export const GENERIC_FALLBACK = 'Something went wrong. Please try again.';

/** The last resort once headers are sent: an error becomes fallback + done, never an HTTP error. */
export function failSse(stream: SseStream, reason: FallbackReason = 'llm_error', content = GENERIC_FALLBACK): void {
  stream.send({ type: 'fallback', reason, content });
  stream.close();
}
