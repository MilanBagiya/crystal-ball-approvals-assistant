import { z } from 'zod';

export const ApprovalTypeSchema = z.enum(['folder', 'video', 'pdf', 'image']);
export const ApprovalStatusSchema = z.enum(['pending_review', 'approved', 'rejected', 'changes_requested']);

// Strict so a typo in the seed file fails loudly at startup instead of being silently stripped.
export const ApprovalItemSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  type: ApprovalTypeSchema,
  submittedBy: z.string().min(1),
  path: z.string().min(1),
  status: ApprovalStatusSchema,
  submittedAt: z.iso.date(),
});

// Ranking and summary validation key on id, so ids must be unique.
export const ApprovalQueueSchema = z
  .array(ApprovalItemSchema)
  .min(1)
  .refine((items) => new Set(items.map((item) => item.id)).size === items.length, {
    message: 'Approval ids must be unique',
  });

export const ApprovalsResponseSchema = z.object({ items: ApprovalQueueSchema });

export type ApprovalType = z.infer<typeof ApprovalTypeSchema>;
export type ApprovalItem = z.infer<typeof ApprovalItemSchema>;
export type ApprovalsResponse = z.infer<typeof ApprovalsResponseSchema>;
