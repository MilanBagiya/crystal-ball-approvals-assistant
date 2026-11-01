import type { ChatMessage } from '@approvals/contracts';

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  /** Called once with token counts when the provider reports them (used for cost logging). */
  onUsage?: (usage: LlmUsage) => void;
}

// The only way services reach a model. Tests inject fakes; production uses AnthropicLlmClient,
// or UnavailableLlmClient when there is no key (or FORCE_LLM_FAILURE=true).
export interface LlmClient {
  readonly model: string;
  streamText(args: LlmRequest, signal: AbortSignal): AsyncIterable<string>;
  completeText(args: LlmRequest, signal: AbortSignal): Promise<string>;
  /**
   * Optional cheap check that the provider is up, for the health endpoint. Clients without it (Anthropic: a
   * hosted API that is up as long as the key is set) are treated as reachable.
   */
  isReachable?(signal: AbortSignal): Promise<boolean>;
}
