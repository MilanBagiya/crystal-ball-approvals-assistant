import { z } from 'zod';

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

export type LlmProvider = 'auto' | 'anthropic' | 'ollama';

const EnvSchema = z.object({
  // auto: Claude when ANTHROPIC_API_KEY is set, otherwise fallbacks. ollama: a free local model, no key needed.
  LLM_PROVIDER: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(['auto', 'anthropic', 'ollama']))
    .default('auto'),
  // Blank (as in .env.example) means "no key": the app runs on fallbacks.
  ANTHROPIC_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((key) => key || undefined),
  ANTHROPIC_MODEL: z.string().trim().min(1).default('claude-haiku-5-5'),
  OLLAMA_BASE_URL: z.url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().trim().min(1).default('qwen2.5:3b'),
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
  llmProvider: LlmProvider;
  anthropicApiKey: string | undefined;
  anthropicModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
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
    llmProvider: e.LLM_PROVIDER,
    anthropicApiKey: e.ANTHROPIC_API_KEY,
    anthropicModel: e.ANTHROPIC_MODEL,
    ollamaBaseUrl: e.OLLAMA_BASE_URL,
    ollamaModel: e.OLLAMA_MODEL,
    llmTimeoutMs: e.LLM_TIMEOUT_MS,
    forceLlmFailure: e.FORCE_LLM_FAILURE,
    rateLimitPerMin: e.RATE_LIMIT_PER_MIN,
    apiPort: e.API_PORT,
  };
}
