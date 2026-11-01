import { HealthResponseSchema, type HealthResponse } from '@approvals/contracts';
import { Router } from 'express';
import { sendJson } from '../http/validate';
import type { LlmClient } from '../llm/LlmClient';
import { UnavailableLlmClient } from '../llm/UnavailableLlmClient';

/** The status bar polls health, so a provider that doesn't answer quickly counts as unreachable. */
const REACHABLE_TIMEOUT_MS = 1500;

async function llmStatus(llm: LlmClient): Promise<HealthResponse['llm']> {
  if (llm instanceof UnavailableLlmClient) return 'not_configured';
  if (!llm.isReachable) return 'configured';

  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(false);
    }, REACHABLE_TIMEOUT_MS);
  });
  try {
    const reachable = await Promise.race([llm.isReachable(controller.signal), timedOut]);
    return reachable && !controller.signal.aborted ? 'configured' : 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

export function systemRoutes(deps: { llm: LlmClient }): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    sendJson(res, HealthResponseSchema, { ok: true, llm: await llmStatus(deps.llm) });
  });

  return router;
}
