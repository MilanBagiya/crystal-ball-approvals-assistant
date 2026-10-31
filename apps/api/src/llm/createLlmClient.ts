import type { AppConfig } from '../config/config';
import { AnthropicLlmClient } from './AnthropicLlmClient';
import type { LlmClient } from './LlmClient';
import { OllamaLlmClient } from './OllamaLlmClient';
import { UnavailableLlmClient } from './UnavailableLlmClient';

// FORCE_LLM_FAILURE wins over everything, so the fallback path can be demoed on any setup.
// LLM_PROVIDER=ollama uses a free local model; otherwise Claude is used when a key is set.
export function createLlmClient(config: AppConfig): LlmClient {
  if (config.forceLlmFailure) return new UnavailableLlmClient('forced');
  if (config.llmProvider === 'ollama') {
    return new OllamaLlmClient({ baseUrl: config.ollamaBaseUrl, model: config.ollamaModel });
  }
  if (!config.anthropicApiKey) return new UnavailableLlmClient('no_api_key');
  return new AnthropicLlmClient({ apiKey: config.anthropicApiKey, model: config.anthropicModel });
}
