import Anthropic, {
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  type ClientOptions,
} from '@anthropic-ai/sdk';
import { LlmError } from './errors';
import type { LlmClient, LlmRequest } from './LlmClient';

export interface AnthropicLlmClientOptions {
  apiKey: string;
  model: string;
  /** Injected in tests to exercise the real SDK without network access. */
  fetch?: ClientOptions['fetch'];
}

export class AnthropicLlmClient implements LlmClient {
  readonly model: string;
  private readonly client: Anthropic;

  constructor(options: AnthropicLlmClientOptions) {
    this.model = options.model;
    this.client = new Anthropic({
      apiKey: options.apiKey,
      // One quick retry for a transient 429/5xx; withTimeout still caps the total wait.
      maxRetries: 1,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  // Every task here is short and latency-sensitive (greeting, one-line reasons, chat replies),
  // so thinking is off and effort is low. Sampling params are not sent: current models reject them.
  private params(args: LlmRequest) {
    return {
      model: this.model,
      max_tokens: args.maxTokens,
      system: args.system,
      messages: args.messages,
      thinking: { type: 'disabled' as const },
      output_config: { effort: 'low' as const },
    };
  }

  async completeText(args: LlmRequest, signal: AbortSignal): Promise<string> {
    try {
      const response = await this.client.messages.create(this.params(args), { signal });
      args.onUsage?.({
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });
      if (response.stop_reason === 'refusal') throw new LlmError('upstream', 'The model declined to answer');

      return response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    } catch (error) {
      throw toLlmError(error);
    }
  }

  async *streamText(args: LlmRequest, signal: AbortSignal): AsyncIterable<string> {
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const stream = this.client.messages.stream(this.params(args), { signal });
      for await (const event of stream) {
        if (event.type === 'message_start') {
          inputTokens = event.message.usage.input_tokens;
        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        } else if (event.type === 'message_delta') {
          outputTokens = event.usage.output_tokens;
          if (event.delta.stop_reason === 'refusal') throw new LlmError('upstream', 'The model declined to answer');
        }
      }
    } catch (error) {
      throw toLlmError(error);
    } finally {
      args.onUsage?.({ inputTokens, outputTokens });
    }
  }
}

// Typed SDK errors become our own LlmError kinds. Messages are generic: provider details (and never the key)
// go to the cause for server logs, not to API clients.
function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (error instanceof APIUserAbortError) return new LlmError('aborted', 'LLM call aborted', { cause: error });
  if (error instanceof APIConnectionTimeoutError)
    return new LlmError('timeout', 'LLM request timed out', { cause: error });
  if (error instanceof AuthenticationError) {
    return new LlmError('upstream', 'The LLM provider rejected the API key', { cause: error });
  }
  if (error instanceof APIError) {
    return new LlmError('upstream', `LLM provider error (status ${error.status ?? 'unknown'})`, { cause: error });
  }
  return new LlmError('upstream', 'LLM call failed', { cause: error });
}
