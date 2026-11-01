import {
  BriefingResponseSchema,
  ChatRequestSchema,
  CommentDraftRequestSchema,
  CommentDraftResponseSchema,
  GreetingRequestSchema,
  GreetingResponseSchema,
  HelpRequestSchema,
  ReviewRequestSchema,
  ReviewResponseSchema,
  SummaryRequestSchema,
  type ApprovalItem,
} from '@approvals/contracts';
import { Router } from 'express';
import type { ApprovalQueue } from '../domain/approvalQueue';
import { buildDashboard } from '../domain/dashboard';
import { HttpError } from '../http/errorHandler';
import { pipeSse } from '../http/pipeSse';
import { sendJson, validateBody } from '../http/validate';
import type { Logger } from '../logging/logger';
import type { BriefingService } from '../services/briefingService';
import type { ChatService } from '../services/chatService';
import type { CommentService } from '../services/commentService';
import type { GreetingService } from '../services/greetingService';
import type { HelpService } from '../services/helpService';
import type { ReviewService } from '../services/reviewService';
import type { SummaryService } from '../services/summaryService';

export interface AiServices {
  greeting: GreetingService;
  summary: SummaryService;
  help: HelpService;
  chat: ChatService;
  review: ReviewService;
  comment: CommentService;
  briefing: BriefingService;
}

// Thin handlers: validate the body, call a service, send a validated response. No prompts, no LLM calls here.
export function aiRoutes(
  services: AiServices,
  logger: Logger,
  queue: ApprovalQueue,
  now: () => Date = () => new Date(),
): Router {
  const router = Router();

  router.post('/briefing', async (_req, res) => {
    sendJson(res, BriefingResponseSchema, await services.briefing.brief(buildDashboard(queue.list(), now())));
  });

  router.post(
    '/greeting',
    validateBody(GreetingRequestSchema, async (body, _req, res) => {
      sendJson(res, GreetingResponseSchema, await services.greeting.greet(body));
    }),
  );

  router.post(
    '/summary',
    validateBody(SummaryRequestSchema, (body, req, res) =>
      pipeSse(req, res, logger, (signal) => services.summary.stream(body, signal)),
    ),
  );

  router.post(
    '/help',
    validateBody(HelpRequestSchema, (body, req, res) =>
      pipeSse(req, res, logger, (signal) => services.help.stream(body, signal)),
    ),
  );

  router.post(
    '/chat',
    validateBody(ChatRequestSchema, (body, req, res) =>
      pipeSse(req, res, logger, (signal) => services.chat.stream(body, signal)),
    ),
  );

  router.post(
    '/review',
    validateBody(ReviewRequestSchema, async (body, _req, res) => {
      sendJson(res, ReviewResponseSchema, await services.review.review(pendingItem(queue, body.itemId)));
    }),
  );

  router.post(
    '/comment',
    validateBody(CommentDraftRequestSchema, async (body, _req, res) => {
      const item = pendingItem(queue, body.itemId);
      const draft = await services.comment.draft({
        item,
        decision: body.decision,
        ...(body.notes ? { notes: body.notes } : {}),
      });
      sendJson(res, CommentDraftResponseSchema, draft);
    }),
  );

  return router;
}

/** The item an AI helper works on: it must exist and still be waiting for review. */
function pendingItem(queue: ApprovalQueue, id: string): ApprovalItem {
  const item = queue.get(id);
  if (!item) throw new HttpError(404, 'not_found', `No approval with id "${id}"`);
  if (item.status !== 'pending_review') {
    throw new HttpError(409, 'already_decided', 'This item has already been reviewed');
  }
  return item;
}
