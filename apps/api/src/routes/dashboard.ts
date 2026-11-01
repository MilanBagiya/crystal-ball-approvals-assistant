import { DashboardSchema } from '@approvals/contracts';
import { Router } from 'express';
import type { ApprovalQueue } from '../domain/approvalQueue';
import { buildDashboard } from '../domain/dashboard';
import { sendJson } from '../http/validate';

// Plain counting and date arithmetic: no AI involved.
export function dashboardRoutes(queue: ApprovalQueue, now: () => Date): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    sendJson(res, DashboardSchema, buildDashboard(queue.list(), now()));
  });
  return router;
}
