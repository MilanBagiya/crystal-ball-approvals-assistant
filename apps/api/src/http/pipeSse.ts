import type { StreamEvent } from '@approvals/contracts';
import type { Request, Response } from 'express';
import { serializeError, type Logger } from '../logging/logger';
import { failSse, openSse } from './sse';

/**
 * Opens an SSE response and forwards every event a service produces. The service gets the
 * disconnect signal, so the LLM call is cancelled if the client leaves. However the service ends,
 * the stream ends with exactly one `done`; an unexpected error becomes a generic fallback first.
 */
export async function pipeSse(
  req: Request,
  res: Response,
  logger: Logger,
  produce: (signal: AbortSignal) => AsyncIterable<StreamEvent>,
): Promise<void> {
  const sse = openSse(req, res);
  try {
    for await (const event of produce(sse.signal)) {
      if (sse.signal.aborted) break; // client gone: stop pulling from the model
      sse.send(event);
    }
    sse.close();
  } catch (error) {
    logger.log({ level: 'error', event: 'stream_failed', path: req.path, error: serializeError(error) });
    failSse(sse);
  }
}
