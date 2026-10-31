import { ApprovalsResponseSchema, HealthResponseSchema, type ApprovalItem } from '@approvals/contracts';
import { Router } from 'express';
import { sendJson } from '../http/validate';
import type { LlmClient } from '../llm/LlmClient';
import { UnavailableLlmClient } from '../llm/UnavailableLlmClient';

export function systemRoutes(deps: { llm: LlmClient; approvals: readonly ApprovalItem[] }): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    const llm = deps.llm instanceof UnavailableLlmClient ? 'not_configured' : 'configured';
    sendJson(res, HealthResponseSchema, { ok: true, llm });
  });

  // The UI reads the queue from here rather than importing the data file.
  router.get('/approvals', (_req, res) => {
    sendJson(res, ApprovalsResponseSchema, { items: [...deps.approvals] });
  });

  return router;
}
