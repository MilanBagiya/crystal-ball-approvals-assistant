import { z } from 'zod';
import { FallbackReasonSchema } from './stream';

export const ReviewRequestSchema = z.object({ itemId: z.string().min(1) });

export const ReviewCheckSchema = z.object({
  check: z.string().trim().min(3).max(160),
  why: z.string().trim().min(3).max(200),
  /** The policy section the check comes from, so the reviewer can look it up. */
  chunkId: z.string().min(1),
});

/** What the model is asked to return. Everything else in the response is decided in code. */
export const ReviewModelOutputSchema = z.object({ checks: z.array(z.unknown()).min(1).max(12) });

export const ReviewResponseSchema = z.object({
  itemId: z.string(),
  deadline: z.string(),
  source: z.enum(['ai', 'fallback']),
  fallbackReason: FallbackReasonSchema.optional(),
  checks: z.array(ReviewCheckSchema).min(1).max(8),
});

export type ReviewCheck = z.infer<typeof ReviewCheckSchema>;
export type ReviewResponse = z.infer<typeof ReviewResponseSchema>;
