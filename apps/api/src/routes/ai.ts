import { GreetingRequestSchema, GreetingResponseSchema } from '@approvals/contracts';
import { Router } from 'express';
import { sendJson, validateBody } from '../http/validate';
import type { GreetingService } from '../services/greetingService';

export interface AiServices {
  greeting: GreetingService;
}

// Thin handlers: validate the body, call a service, send a validated response. No prompts, no LLM calls here.
export function aiRoutes(services: AiServices): Router {
  const router = Router();

  router.post(
    '/greeting',
    validateBody(GreetingRequestSchema, async (body, _req, res) => {
      sendJson(res, GreetingResponseSchema, await services.greeting.greet(body));
    }),
  );

  return router;
}
