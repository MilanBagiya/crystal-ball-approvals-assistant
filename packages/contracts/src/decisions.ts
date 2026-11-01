import { z } from 'zod';
import { ApprovalItemSchema } from './approvals';

export const DecisionSchema = z.enum(['approve', 'request_changes', 'reject']);

export const DecisionRequestSchema = z
  .object({
    decision: DecisionSchema,
    comment: z.string().trim().max(1000).optional(),
  })
  // The submitter needs to know what to fix or why it was refused; an approval can stand on its own.
  .refine((body) => body.decision === 'approve' || (body.comment?.length ?? 0) >= 3, {
    message: 'A comment is required when requesting changes or rejecting',
    path: ['comment'],
  });

export const DecisionResponseSchema = z.object({ item: ApprovalItemSchema });

export type Decision = z.infer<typeof DecisionSchema>;
export type DecisionRequest = z.infer<typeof DecisionRequestSchema>;
export type DecisionResponse = z.infer<typeof DecisionResponseSchema>;
