import type { LlmClient, LlmRequest } from '../../src/llm/LlmClient';

// Hand-rolled fakes for the LlmClient interface. Every fake records the requests it received.

export interface FakeLlm extends LlmClient {
  requests: LlmRequest[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Streams the given chunks (optionally with a delay between them) and completes with their concatenation. */
export function fakeLlm(
  chunks: readonly string[],
  options: { delayMs?: number; usage?: { inputTokens: number; outputTokens: number } } = {},
): FakeLlm {
  const requests: LlmRequest[] = [];
  const reportUsage = (args: LlmRequest) => options.usage && args.onUsage?.(options.usage);
  return {
    model: 'fake-model',
    requests,
    async *streamText(args) {
      requests.push(args);
      for (const chunk of chunks) {
        if (options.delayMs) await sleep(options.delayMs);
        yield chunk;
      }
      reportUsage(args);
    },
    async completeText(args) {
      requests.push(args);
      if (options.delayMs) await sleep(options.delayMs);
      reportUsage(args);
      return chunks.join('');
    },
  };
}

/** Never produces anything and ignores the abort signal: the worst case for timeouts. */
export function hangingLlm(): FakeLlm {
  const requests: LlmRequest[] = [];
  return {
    model: 'fake-model',
    requests,
    // eslint-disable-next-line require-yield -- never yields, by design
    async *streamText(args) {
      requests.push(args);
      await new Promise<never>(() => undefined);
    },
    completeText(args) {
      requests.push(args);
      return new Promise<never>(() => undefined);
    },
  };
}

/** Yields the given chunks, then hangs (a stream that stalls mid-answer). */
export function stallingLlm(chunks: readonly string[]): FakeLlm {
  const requests: LlmRequest[] = [];
  return {
    ...hangingLlm(),
    requests,
    async *streamText(args) {
      requests.push(args);
      yield* chunks;
      await new Promise<never>(() => undefined);
    },
  };
}

/** Fails every call with the given error (for streams: after yielding `chunksBeforeError`). */
export function failingLlm(error: Error, chunksBeforeError: readonly string[] = []): FakeLlm {
  const requests: LlmRequest[] = [];
  return {
    model: 'fake-model',
    requests,
    async *streamText(args) {
      requests.push(args);
      yield* chunksBeforeError;
      throw error;
    },
    async completeText(args) {
      requests.push(args);
      throw error;
    },
  };
}

export const request = (overrides: Partial<LlmRequest> = {}): LlmRequest => ({
  system: 'You are a test.',
  messages: [{ role: 'user', content: 'hi' }],
  maxTokens: 100,
  ...overrides,
});

export async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const chunk of stream) out.push(chunk);
  return out;
}
