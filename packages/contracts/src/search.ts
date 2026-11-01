import { z } from 'zod';
import { UrgencySchema } from './aiOutputs';
import { ApprovalStatusSchema, ApprovalTypeSchema } from './approvals';
import { FallbackReasonSchema } from './stream';

export const SearchRequestSchema = z.object({ query: z.string().trim().min(1).max(200) });

/** A structured search. Every field is optional; an item must match all the fields that are present. */
export const SearchFilterSchema = z.object({
  types: z.array(ApprovalTypeSchema).min(1).max(4).optional(),
  statuses: z.array(ApprovalStatusSchema).min(1).max(4).optional(),
  urgencies: z.array(UrgencySchema).min(1).max(3).optional(),
  submitters: z.array(z.string().min(1).max(80)).min(1).max(10).optional(),
  /** Free-text match on title, submitter, folder path and type: the keyword search. */
  text: z.string().max(200).optional(),
});

export const SearchResponseSchema = z.object({
  query: z.string(),
  filter: SearchFilterSchema,
  /** Matching items, in queue order. Worked out in code from the filter, never by the model. */
  itemIds: z.array(z.string()),
  source: z.enum(['ai', 'keyword']),
  fallbackReason: FallbackReasonSchema.optional(),
});

export type SearchFilter = z.infer<typeof SearchFilterSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
