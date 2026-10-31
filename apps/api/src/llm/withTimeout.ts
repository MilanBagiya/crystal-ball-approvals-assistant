import { LlmError } from './errors';
import type { LlmClient, LlmRequest } from './LlmClient';

export interface CompleteTimeouts {
  timeoutMs: number;
  /** Aborted by the caller, e.g. when the HTTP client disconnects. */
  signal?: AbortSignal;
}

export interface StreamTimeouts {
  /** Time allowed before the first chunk. */
  firstTokenMs: number;
  /** Time allowed between chunks after that. A slow but steady stream never hits it. */
  idleMs: number;
  signal?: AbortSignal;
}

export async function completeWithTimeout(
  llm: LlmClient,
  args: LlmRequest,
  options: CompleteTimeouts,
): Promise<string> {
  const link = linkAbort(options.signal);
  try {
    return await raceTimeout(llm.completeText(args, link.controller.signal), options.timeoutMs, link.controller);
  } catch (error) {
    throw toLlmError(error, options.signal);
  } finally {
    link.dispose();
  }
}

export async function* streamWithTimeout(
  llm: LlmClient,
  args: LlmRequest,
  options: StreamTimeouts,
): AsyncGenerator<string, void, undefined> {
  const link = linkAbort(options.signal);
  const iterator = llm.streamText(args, link.controller.signal)[Symbol.asyncIterator]();
  let waitMs = options.firstTokenMs;

  try {
    while (true) {
      const next = await raceTimeout(iterator.next(), waitMs, link.controller);
      if (next.done) return;
      waitMs = options.idleMs;
      yield next.value;
    }
  } catch (error) {
    throw toLlmError(error, options.signal);
  } finally {
    // Runs on completion, error, timeout, or when the consumer stops early: always cancel upstream.
    link.dispose();
    // Don't await: a hung iterator may never settle.
    iterator.return?.().catch(() => undefined);
  }
}

// Settles with `work`, or rejects with a timeout after `ms` (aborting the controller so upstream stops),
// or rejects as aborted if the controller is aborted from outside. Never waits on a model that ignores its signal.
function raceTimeout<T>(work: Promise<T>, ms: number, controller: AbortController): Promise<T> {
  // A late rejection from abandoned work must not become an unhandled rejection.
  work.catch(() => undefined);

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new LlmError('aborted', 'LLM call aborted'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new LlmError('timeout', `LLM did not respond within ${ms}ms`));
      controller.abort();
    }, ms);
    const cleanup = () => {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
    };

    if (controller.signal.aborted) return onAbort();
    controller.signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

// An inner controller we can abort ourselves, which is also aborted when the caller's signal is.
function linkAbort(parent: AbortSignal | undefined): { controller: AbortController; dispose: () => void } {
  const controller = new AbortController();
  const forward = () => controller.abort();

  if (parent?.aborted) controller.abort();
  parent?.addEventListener('abort', forward, { once: true });

  return {
    controller,
    dispose: () => {
      parent?.removeEventListener('abort', forward);
      controller.abort();
    },
  };
}

function toLlmError(error: unknown, parent: AbortSignal | undefined): LlmError {
  if (error instanceof LlmError) return error;
  if (parent?.aborted) return new LlmError('aborted', 'LLM call aborted', { cause: error });
  const message = error instanceof Error ? error.message : 'Unknown LLM error';
  return new LlmError('upstream', message, { cause: error });
}
