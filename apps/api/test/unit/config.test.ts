import { ConfigError, loadConfig } from '../../src/config/config';
import { AnthropicLlmClient } from '../../src/llm/AnthropicLlmClient';
import { createLlmClient } from '../../src/llm/createLlmClient';
import { OllamaLlmClient } from '../../src/llm/OllamaLlmClient';
import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import { collect, request } from '../fakes/fakeLlm';

describe('loadConfig', () => {
  it('applies the documented defaults to an empty environment', () => {
    expect(loadConfig({})).toEqual({
      llmProvider: 'auto',
      anthropicApiKey: undefined,
      anthropicModel: 'claude-haiku-5-5',
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaModel: 'qwen2.5:3b',
      llmTimeoutMs: 8000,
      forceLlmFailure: false,
      rateLimitPerMin: 20,
      apiPort: 4000,
    });
  });

  it('parses every variable from strings', () => {
    const config = loadConfig({
      LLM_PROVIDER: 'Ollama',
      ANTHROPIC_API_KEY: 'sk-test',
      ANTHROPIC_MODEL: 'claude-sonnet-5-5',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11500',
      OLLAMA_MODEL: 'llama3.2:3b',
      LLM_TIMEOUT_MS: '1', // the README's "force a timeout" demo value
      FORCE_LLM_FAILURE: 'TRUE',
      RATE_LIMIT_PER_MIN: '5',
      API_PORT: '4100',
    });

    expect(config).toEqual({
      llmProvider: 'ollama',
      anthropicApiKey: 'sk-test',
      anthropicModel: 'claude-sonnet-5-5',
      ollamaBaseUrl: 'http://127.0.0.1:11500',
      ollamaModel: 'llama3.2:3b',
      llmTimeoutMs: 1,
      forceLlmFailure: true,
      rateLimitPerMin: 5,
      apiPort: 4100,
    });
  });

  it('treats a blank API key as missing (the .env.example default)', () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: '   ' }).anthropicApiKey).toBeUndefined();
  });

  it.each([
    ['LLM_TIMEOUT_MS', 'abc'],
    ['LLM_TIMEOUT_MS', '0'],
    ['RATE_LIMIT_PER_MIN', '-1'],
    ['FORCE_LLM_FAILURE', 'maybe'],
    ['API_PORT', '70000'],
    ['LLM_PROVIDER', 'openai'],
    ['OLLAMA_BASE_URL', 'not a url'],
  ])('refuses %s=%s with an error naming the variable', (name, value) => {
    expect(() => loadConfig({ [name]: value })).toThrow(ConfigError);
    expect(() => loadConfig({ [name]: value })).toThrow(name);
  });
});

describe('createLlmClient', () => {
  const base = loadConfig({});
  const signal = new AbortController().signal;

  it('uses the unavailable client with reason no_api_key when there is no key', async () => {
    const llm = createLlmClient(base);

    expect(llm).toBeInstanceOf(UnavailableLlmClient);
    await expect(collect(llm.streamText(request(), signal))).rejects.toMatchObject({ unavailableReason: 'no_api_key' });
  });

  it('honours FORCE_LLM_FAILURE even when a key is set', async () => {
    const llm = createLlmClient({ ...base, anthropicApiKey: 'sk-test', forceLlmFailure: true });

    expect(llm).toBeInstanceOf(UnavailableLlmClient);
    await expect(llm.completeText(request(), signal)).rejects.toMatchObject({ unavailableReason: 'forced' });
  });

  it('uses the Anthropic client with the configured model when a key is set', () => {
    const llm = createLlmClient({ ...base, anthropicApiKey: 'sk-test', anthropicModel: 'claude-sonnet-5-5' });

    expect(llm).toBeInstanceOf(AnthropicLlmClient);
    expect(llm.model).toBe('claude-sonnet-5-5');
  });

  it('uses the local Ollama client when LLM_PROVIDER=ollama, with no key needed', () => {
    const llm = createLlmClient({ ...base, llmProvider: 'ollama', ollamaModel: 'llama3.2:3b' });

    expect(llm).toBeInstanceOf(OllamaLlmClient);
    expect(llm.model).toBe('llama3.2:3b');
  });

  it('prefers Ollama over a configured Anthropic key when the provider is set explicitly', () => {
    const llm = createLlmClient({ ...base, llmProvider: 'ollama', anthropicApiKey: 'sk-test' });

    expect(llm).toBeInstanceOf(OllamaLlmClient);
  });

  it('reports no_api_key when LLM_PROVIDER=anthropic but the key is missing', async () => {
    const llm = createLlmClient({ ...base, llmProvider: 'anthropic' });

    await expect(llm.completeText(request(), signal)).rejects.toMatchObject({ unavailableReason: 'no_api_key' });
  });

  it('still honours FORCE_LLM_FAILURE with Ollama', () => {
    expect(createLlmClient({ ...base, llmProvider: 'ollama', forceLlmFailure: true })).toBeInstanceOf(
      UnavailableLlmClient,
    );
  });
});
