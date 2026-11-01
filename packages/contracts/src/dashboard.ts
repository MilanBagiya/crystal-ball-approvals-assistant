import { z } from 'zod';
import { UrgencySchema } from './aiOutputs';
import { ApprovalItemSchema, ApprovalTypeSchema } from './approvals';

const count = z.number().int().nonnegative();

export const DeadlineSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: ApprovalTypeSchema,
  urgency: UrgencySchema,
  /** Submission date plus the policy SLA (24 h for safety items, 72 h for the rest). */
  dueAt: z.iso.datetime(),
  /** Negative once the deadline has passed. */
  hoursLeft: z.number().int(),
  overdue: z.boolean(),
});

export const DashboardSchema = z.object({
  generatedAt: z.iso.datetime(),
  counts: z.object({
    pending_review: count,
    approved: count,
    changes_requested: count,
    rejected: count,
    total: count,
  }),
  pendingByType: z.object({ folder: count, video: count, pdf: count, image: count }),
  /** Pending items, most urgent deadline first. */
  deadlines: z.array(DeadlineSchema),
  /** Latest decisions first. */
  recentDecisions: z.array(ApprovalItemSchema).max(5),
});

export const BriefingResponseSchema = z.object({
  briefing: z.string().trim().min(3).max(500),
  source: z.enum(['ai', 'template']),
});

/** The model's JSON reply. */
export const BriefingModelOutputSchema = BriefingResponseSchema.pick({ briefing: true });

export type Deadline = z.infer<typeof DeadlineSchema>;
export type Dashboard = z.infer<typeof DashboardSchema>;
export type BriefingResponse = z.infer<typeof BriefingResponseSchema>;
