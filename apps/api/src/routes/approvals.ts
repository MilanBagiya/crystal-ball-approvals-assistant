import { ApprovalsResponseSchema, DecisionRequestSchema, DecisionResponseSchema } from '@approvals/contracts';
import { Router } from 'express';
import type { ApprovalQueue } from '../domain/approvalQueue';
import { HttpError } from '../http/errorHandler';
import { sendJson, validateBody } from '../http/validate';

export function approvalRoutes(queue: ApprovalQueue): Router {
  const router = Router();

  // The UI reads the queue from here rather than importing the data file.
  router.get('/', (_req, res) => {
    sendJson(res, ApprovalsResponseSchema, { items: [...queue.list()] });
  });

  // A reviewer's decision. Deterministic and AI-free: the model can suggest checks and draft comments, never decide.
  router.post(
    '/:id/decision',
    validateBody(DecisionRequestSchema, (body, req, res) => {
      const id = String(req.params.id);
      const result = queue.decide(id, body.decision, body.comment);
      if (!result.ok && result.reason === 'not_found') {
        throw new HttpError(404, 'not_found', `No approval with id "${id}"`);
      }
      if (!result.ok) throw new HttpError(409, 'already_decided', 'This item has already been reviewed');
      sendJson(res, DecisionResponseSchema, { item: result.item });
    }),
  );

  return router;
}
