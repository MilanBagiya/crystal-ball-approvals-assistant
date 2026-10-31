import type { AppConfig } from '../config/config';
import { AnthropicLlmClient } from './AnthropicLlmClient';
import type { LlmClient } from './LlmClient';
import { UnavailableLlmClient } from './UnavailableLlmClient';

// FORCE_LLM_FAILURE wins over a configured key, so the fallback path can be demoed on a machine that has one.
export function createLlmClient(config: AppConfig): LlmClient {
  if (config.forceLlmFailure) return new UnavailableLlmClient('forced');
  if (!config.anthropicApiKey) return new UnavailableLlmClient('no_api_key');
  return new AnthropicLlmClient({ apiKey: config.anthropicApiKey, model: config.anthropicModel });
}
