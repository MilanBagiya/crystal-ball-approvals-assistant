import { z } from 'zod';

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  // unreachable: a provider is configured but isn't answering (e.g. Ollama stopped).
  llm: z.enum(['configured', 'not_configured', 'unreachable']),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
