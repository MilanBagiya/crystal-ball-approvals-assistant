import { z } from 'zod';
import { SummaryHeadlineSchema, SummaryItemSchema } from './aiOutputs';

// Where a structured part came from: validated model output, or the deterministic fallback.
export const PartSourceSchema = z.enum(['ai', 'fallback']);

export const FallbackReasonSchema = z.enum(['timeout', 'llm_error', 'invalid_output', 'no_api_key', 'forced']);

export const TokenEventSchema = z.object({ type: z.literal('token'), text: z.string().min(1) });

// `type` is declared first so it is also the first key on the wire, which keeps raw SSE frames readable.
export const SummaryHeadlineEventSchema = z.object({
  type: z.literal('summary_headline'),
  ...SummaryHeadlineSchema.omit({ type: true }).shape,
  source: PartSourceSchema,
});

export const SummaryItemEventSchema = z.object({
  type: z.literal('summary_item'),
  ...SummaryItemSchema.omit({ type: true }).shape,
  source: PartSourceSchema,
});

export const SourcesEventSchema = z.object({ type: z.literal('sources'), chunkIds: z.array(z.string().min(1)).min(1) });

export const FallbackEventSchema = z.object({
  type: z.literal('fallback'),
  reason: FallbackReasonSchema,
  content: z.string(),
});

export const DoneEventSchema = z.object({ type: z.literal('done') });

export const StreamEventSchema = z.discriminatedUnion('type', [
  TokenEventSchema,
  SummaryHeadlineEventSchema,
  SummaryItemEventSchema,
  SourcesEventSchema,
  FallbackEventSchema,
  DoneEventSchema,
]);

export type PartSource = z.infer<typeof PartSourceSchema>;
export type FallbackReason = z.infer<typeof FallbackReasonSchema>;
export type SummaryHeadlineEvent = z.infer<typeof SummaryHeadlineEventSchema>;
export type SummaryItemEvent = z.infer<typeof SummaryItemEventSchema>;
export type FallbackEvent = z.infer<typeof FallbackEventSchema>;
export type StreamEvent = z.infer<typeof StreamEventSchema>;
