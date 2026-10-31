import { LlmError } from './errors';
import type { LlmClient, LlmRequest } from './LlmClient';

export interface OllamaLlmClientOptions {
  /** Where `ollama serve` listens, e.g. http://localhost:11434. */
  baseUrl: string;
  model: string;
  /** Injected in tests; defaults to the global fetch, so no extra dependency is needed. */
  fetch?: typeof fetch;
}

// One line of Ollama's /api/chat response (the whole body when not streaming, one NDJSON line when streaming).
interface ChatChunk {
  message?: { content?: string };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

/**
 * A free, local alternative to Claude: talks to an Ollama server over its HTTP API.
 * Same LlmClient contract, so prompts, validation, timeouts and fallbacks all work unchanged.
 */
export class OllamaLlmClient implements LlmClient {
  readonly model: string;
  private readonly chatUrl: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: OllamaLlmClientOptions) {
    this.model = options.model;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.chatUrl = `${this.baseUrl}/api/chat`;
    this.fetchFn = options.fetch ?? fetch;
  }

  async completeText(args: LlmRequest, signal: AbortSignal): Promise<string> {
    const response = await this.post(args, false, signal);
    const body = (await response.json()) as ChatChunk;
    if (body.error) throw new LlmError('upstream', `Ollama error: ${body.error}`);
    this.reportUsage(args, body);
    return body.message?.content ?? '';
  }

  async *streamText(args: LlmRequest, signal: AbortSignal): AsyncIterable<string> {
    const response = await this.post(args, true, signal);
    if (!response.body) throw new LlmError('upstream', 'Ollama returned an empty stream');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const text = this.handleLine(args, line);
          if (text) yield text;
        }
      }
      const text = this.handleLine(args, buffer);
      if (text) yield text;
    } catch (error) {
      throw this.toLlmError(error, signal);
    } finally {
      reader.releaseLock();
    }
  }

  /** Parses one NDJSON line; returns its text, reports usage on the final line, throws on an error line. */
  private handleLine(args: LlmRequest, line: string): string {
    if (!line.trim()) return '';
    const chunk = JSON.parse(line) as ChatChunk;
    if (chunk.error) throw new LlmError('upstream', `Ollama error: ${chunk.error}`);
    if (chunk.done) this.reportUsage(args, chunk);
    return chunk.message?.content ?? '';
  }

  private async post(args: LlmRequest, stream: boolean, signal: AbortSignal): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchFn(this.chatUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream,
          messages: [{ role: 'system', content: args.system }, ...args.messages],
          options: { num_predict: args.maxTokens },
        }),
        signal,
      });
    } catch (error) {
      throw this.toLlmError(error, signal);
    }

    if (response.status === 404) {
      throw new LlmError('upstream', `Ollama model "${this.model}" isn't installed. Run: ollama pull ${this.model}`);
    }
    if (!response.ok) throw new LlmError('upstream', `Ollama returned HTTP ${response.status}`);
    return response;
  }

  private reportUsage(args: LlmRequest, chunk: ChatChunk): void {
    args.onUsage?.({ inputTokens: chunk.prompt_eval_count ?? 0, outputTokens: chunk.eval_count ?? 0 });
  }

  private toLlmError(error: unknown, signal: AbortSignal): LlmError {
    if (error instanceof LlmError) return error;
    if (signal.aborted) return new LlmError('aborted', 'LLM call aborted', { cause: error });
    if (error instanceof TypeError) {
      // fetch throws TypeError when nothing is listening: Ollama isn't installed or isn't running.
      return new LlmError('upstream', `Ollama isn't reachable at ${this.baseUrl}. Is it running?`, { cause: error });
    }
    return new LlmError('upstream', 'Ollama call failed', { cause: error });
  }
}
