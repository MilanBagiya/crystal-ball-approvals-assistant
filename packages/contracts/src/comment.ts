import { z } from 'zod';

export const CommentDraftRequestSchema = z.object({
  itemId: z.string().min(1),
  // Approvals need no explanation; a draft is only offered when the submitter has something to fix or to know.
  decision: z.enum(['request_changes', 'reject']),
  /** The reviewer's own short notes, which the draft turns into a message. */
  notes: z.string().trim().max(500).optional(),
});

export const CommentDraftResponseSchema = z.object({
  comment: z.string().trim().min(3).max(1000),
  source: z.enum(['ai', 'template']),
});

/** The model's JSON reply. */
export const CommentModelOutputSchema = CommentDraftResponseSchema.pick({ comment: true });

export type CommentDraftRequest = z.infer<typeof CommentDraftRequestSchema>;
export type CommentDraftResponse = z.infer<typeof CommentDraftResponseSchema>;
