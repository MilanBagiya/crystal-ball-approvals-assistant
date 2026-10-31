import { LlmError } from './errors';
import type { LlmClient, LlmRequest, LlmUsage } from './LlmClient';
import type { LlmOutcome, UsageLogger } from './usageLog';
import { completeWithTimeout, streamWithTimeout } from './withTimeout';

export interface PromptRef {
  id: string;
  version: string;
}

export interface RunOptions {
  prompt: PromptRef;
  signal?: AbortSignal;
}

export interface LlmRunner {
  complete(args: LlmRequest, options: RunOptions): Promise<string>;
  stream(args: LlmRequest, options: RunOptions): AsyncGenerator<string, void, undefined>;
}

// What services use instead of the raw client: applies LLM_TIMEOUT_MS (total for completions; first-token
// and idle for streams) and logs exactly one usage record per call, whatever happens.
export function createLlmRunner(deps: {
  llm: LlmClient;
  timeoutMs: number;
  logUsage: UsageLogger;
  now?: () => number;
}): LlmRunner {
  const now = deps.now ?? Date.now;

  function startCall(args: LlmRequest, prompt: PromptRef) {
    const startedAt = now();
    const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
    const tracked: LlmRequest = {
      ...args,
      onUsage: (reported) => {
        Object.assign(usage, reported);
        args.onUsage?.(reported);
      },
    };
    const finish = (outcome: LlmOutcome) =>
      deps.logUsage({
        promptId: prompt.id,
        promptVersion: prompt.version,
        model: deps.llm.model,
        ...usage,
        latencyMs: now() - startedAt,
        outcome,
      });
    return { tracked, finish };
  }

  return {
    async complete(args, { prompt, signal }) {
      const call = startCall(args, prompt);
      try {
        const text = await completeWithTimeout(deps.llm, call.tracked, { timeoutMs: deps.timeoutMs, signal });
        call.finish('ok');
        return text;
      } catch (error) {
        call.finish(outcomeOf(error));
        throw error;
      }
    },

    async *stream(args, { prompt, signal }) {
      const call = startCall(args, prompt);
      let outcome: LlmOutcome = 'aborted'; // stays "aborted" if the consumer stops reading early
      try {
        yield* streamWithTimeout(deps.llm, call.tracked, {
          firstTokenMs: deps.timeoutMs,
          idleMs: deps.timeoutMs,
          signal,
        });
        outcome = 'ok';
      } catch (error) {
        outcome = outcomeOf(error);
        throw error;
      } finally {
        call.finish(outcome);
      }
    },
  };
}

function outcomeOf(error: unknown): LlmOutcome {
  if (!(error instanceof LlmError)) return 'error';
  if (error.kind === 'upstream') return 'error';
  return error.kind;
}
