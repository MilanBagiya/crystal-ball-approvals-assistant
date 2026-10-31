import type { Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import { HttpError } from './errorHandler';

// Zod validation middleware: the handler only ever sees a parsed, typed body.
// A failure is a 400 in the ApiError shape, listing each failing field.
export function validateBody<S extends z.ZodType>(
  schema: S,
  handler: (body: z.output<S>, req: Request, res: Response) => Promise<void> | void,
): RequestHandler {
  return async (req, res) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; ');
      throw new HttpError(400, 'invalid_request', message);
    }
    await handler(result.data, req, res);
  };
}

/** Validates an outgoing JSON body against its contract before sending it. */
export function sendJson<S extends z.ZodType>(res: Response, schema: S, body: z.input<S>, status = 200): void {
  res.status(status).json(schema.parse(body));
}
