import { z } from 'zod';

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  llm: z.enum(['configured', 'not_configured']),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
