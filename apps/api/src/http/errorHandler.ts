import type { ApiError } from '@approvals/contracts';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { serializeError, type Logger } from '../logging/logger';
import { failSse, getOpenSse, GENERIC_FALLBACK } from './sse';

export class HttpError extends Error {
  override name = 'HttpError';

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const errorBody = (code: string, message: string): ApiError => ({ error: { code, message } });

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, 'not_found', `No route for ${req.method} ${req.path}`));
};

// Maps every error to the ApiError shape. Unexpected errors get a generic message; details go to the logs only.
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, _next) => {
    if (res.headersSent) {
      const stream = getOpenSse(res);
      logger.log({ level: 'error', event: 'error_after_headers', path: req.path, error: serializeError(error) });
      if (stream) failSse(stream);
      else res.end();
      return;
    }

    const known = toHttpError(error);
    if (!known) {
      logger.log({ level: 'error', event: 'unhandled_error', path: req.path, error: serializeError(error) });
    }
    const { status, code, message } = known ?? { status: 500, code: 'internal_error', message: GENERIC_FALLBACK };
    res.status(status).json(errorBody(code, message));
  };
}

function toHttpError(error: unknown): HttpError | undefined {
  if (error instanceof HttpError) return error;
  // body-parser marks its errors with a `type`.
  const type = typeof error === 'object' && error !== null && 'type' in error ? error.type : undefined;
  if (type === 'entity.parse.failed') return new HttpError(400, 'invalid_request', 'Request body is not valid JSON');
  if (type === 'entity.too.large') return new HttpError(413, 'payload_too_large', 'Request body is too large');
  return undefined;
}
