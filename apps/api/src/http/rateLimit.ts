import type { ApiError } from '@approvals/contracts';
import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

const WINDOW_MS = 60_000;
// The session id is chosen by the client, so it can't be the only key: one IP may run a few sessions
// (tabs, a shared office), but rotating ids to dodge the limit hits this cap.
const IP_CAP_MULTIPLIER = 5;
const SESSION_ID = /^[A-Za-z0-9-]{8,64}$/;

const tooManyRequests: ApiError = {
  error: { code: 'rate_limited', message: 'Too many requests, please wait a moment.' },
};

const ipKey = (req: Request) => `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;

function sessionKey(req: Request): string {
  const id = req.get('x-session-id');
  return id && SESSION_ID.test(id) ? `session:${id}` : ipKey(req);
}

/**
 * Limits for /api/ai/*: RATE_LIMIT_PER_MIN per session (IP if there's no valid session id), plus an IP-wide cap.
 * In-memory: fine for one process. Production with several instances would use a shared store (e.g. Redis).
 */
export function aiRateLimiters(limitPerMin: number): RequestHandler[] {
  const common = {
    windowMs: WINDOW_MS,
    standardHeaders: 'draft-8' as const,
    legacyHeaders: false,
    handler: (_req: Request, res: Parameters<RequestHandler>[1]) => {
      res.status(429).json(tooManyRequests);
    },
  };

  return [
    rateLimit({ ...common, limit: limitPerMin * IP_CAP_MULTIPLIER, keyGenerator: ipKey }),
    rateLimit({ ...common, limit: limitPerMin, keyGenerator: sessionKey }),
  ];
}
