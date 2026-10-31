import { z } from 'zod';

// Shapes the model is asked to produce. The server validates every one before it reaches the UI.

export const UrgencySchema = z.enum(['high', 'medium', 'low']);

export const SummaryHeadlineSchema = z.object({
  type: z.literal('headline'),
  text: z.string().min(1).max(300),
  pendingCount: z.number().int().nonnegative(),
});

export const SummaryItemSchema = z.object({
  type: z.literal('item'),
  id: z.string().min(1),
  rank: z.number().int().positive(),
  urgency: UrgencySchema,
  reason: z.string().min(1).max(240),
});

export const GreetingSchema = z.object({
  greeting: z.string().min(1).max(220),
});

export const GreetingResponseSchema = GreetingSchema.extend({
  source: z.enum(['ai', 'template']),
});

export type Urgency = z.infer<typeof UrgencySchema>;
export type SummaryHeadline = z.infer<typeof SummaryHeadlineSchema>;
export type SummaryItem = z.infer<typeof SummaryItemSchema>;
export type Greeting = z.infer<typeof GreetingSchema>;
export type GreetingResponse = z.infer<typeof GreetingResponseSchema>;
