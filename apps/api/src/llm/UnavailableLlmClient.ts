import { LlmError, type UnavailableReason } from './errors';
import type { LlmClient, LlmRequest } from './LlmClient';

// Stands in for the model when there is no API key or FORCE_LLM_FAILURE=true.
// Every call fails fast with a typed error, so every endpoint takes its fallback path.
export class UnavailableLlmClient implements LlmClient {
  readonly model = 'unavailable';

  constructor(private readonly reason: UnavailableReason) {}

  private error(): LlmError {
    const message = this.reason === 'forced' ? 'LLM disabled by FORCE_LLM_FAILURE' : 'ANTHROPIC_API_KEY is not set';
    return new LlmError('unavailable', message, { unavailableReason: this.reason });
  }

  completeText(_args: LlmRequest, _signal: AbortSignal): Promise<string> {
    return Promise.reject(this.error());
  }

  // eslint-disable-next-line require-yield -- fails before the first chunk, by design
  async *streamText(_args: LlmRequest, _signal: AbortSignal): AsyncIterable<string> {
    throw this.error();
  }
}
