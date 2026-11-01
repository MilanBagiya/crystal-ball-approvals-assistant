import { HealthResponseSchema } from '@approvals/contracts';
import { Router } from 'express';
import { sendJson } from '../http/validate';
import type { LlmClient } from '../llm/LlmClient';
import { UnavailableLlmClient } from '../llm/UnavailableLlmClient';

export function systemRoutes(deps: { llm: LlmClient }): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    const llm = deps.llm instanceof UnavailableLlmClient ? 'not_configured' : 'configured';
    sendJson(res, HealthResponseSchema, { ok: true, llm });
  });

  return router;
}
