import { z } from 'zod';

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const EnvSchema = z.object({
  // Blank (as in .env.example) means "no key": the app runs on fallbacks.
  ANTHROPIC_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((key) => key || undefined),
  ANTHROPIC_MODEL: z.string().trim().min(1).default('claude-haiku-5-5'),
  LLM_TIMEOUT_MS: positiveInt(8000),
  FORCE_LLM_FAILURE: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(['true', 'false', '1', '0']))
    .default('false')
    .transform((value) => value === 'true' || value === '1'),
  RATE_LIMIT_PER_MIN: positiveInt(20),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
});

export interface AppConfig {
  anthropicApiKey: string | undefined;
  anthropicModel: string;
  llmTimeoutMs: number;
  forceLlmFailure: boolean;
  rateLimitPerMin: number;
  apiPort: number;
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  const e = result.data;
  return {
    anthropicApiKey: e.ANTHROPIC_API_KEY,
    anthropicModel: e.ANTHROPIC_MODEL,
    llmTimeoutMs: e.LLM_TIMEOUT_MS,
    forceLlmFailure: e.FORCE_LLM_FAILURE,
    rateLimitPerMin: e.RATE_LIMIT_PER_MIN,
    apiPort: e.API_PORT,
  };
}
