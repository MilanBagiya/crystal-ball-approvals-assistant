import {
  ChatRequestSchema,
  GreetingRequestSchema,
  GreetingResponseSchema,
  HelpRequestSchema,
  SummaryRequestSchema,
} from '@approvals/contracts';
import { Router } from 'express';
import { pipeSse } from '../http/pipeSse';
import { sendJson, validateBody } from '../http/validate';
import type { Logger } from '../logging/logger';
import type { ChatService } from '../services/chatService';
import type { GreetingService } from '../services/greetingService';
import type { HelpService } from '../services/helpService';
import type { SummaryService } from '../services/summaryService';

export interface AiServices {
  greeting: GreetingService;
  summary: SummaryService;
  help: HelpService;
  chat: ChatService;
}

// Thin handlers: validate the body, call a service, send a validated response. No prompts, no LLM calls here.
export function aiRoutes(services: AiServices, logger: Logger): Router {
  const router = Router();

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

  return router;
}
