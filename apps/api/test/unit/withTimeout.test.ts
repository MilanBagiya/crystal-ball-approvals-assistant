import { LlmError } from '../../src/llm/errors';
import type { LlmClient } from '../../src/llm/LlmClient';
import { completeWithTimeout, streamWithTimeout } from '../../src/llm/withTimeout';
import { collect, failingLlm, fakeLlm, hangingLlm, request, stallingLlm } from '../fakes/fakeLlm';

// Real timers with small values: these tests are about wall-clock behaviour, so we measure it.
const streamTimeouts = { firstTokenMs: 60, idleMs: 60 };

async function timed<T>(work: () => Promise<T>): Promise<{ ms: number; result: PromiseSettledResult<T> }> {
  const start = Date.now();
  const [result] = await Promise.allSettled([work()]);
  return { ms: Date.now() - start, result: result! };
}

/** A fake that records the signal it was given, so tests can check the call was really aborted. */
function signalSpyLlm(inner: LlmClient): LlmClient & { signals: AbortSignal[] } {
  const signals: AbortSignal[] = [];
  return {
    model: inner.model,
    signals,
    streamText: (args, signal) => {
      signals.push(signal);
      return inner.streamText(args, signal);
    },
    completeText: (args, signal) => {
      signals.push(signal);
      return inner.completeText(args, signal);
    },
  };
}

describe('completeWithTimeout', () => {
  it('returns the text when the model answers in time', async () => {
    await expect(completeWithTimeout(fakeLlm(['Hello']), request(), { timeoutMs: 200 })).resolves.toBe('Hello');
  });

  it('rejects with a timeout after timeoutMs even if the model ignores the abort signal', async () => {
    const llm = signalSpyLlm(hangingLlm());

    const { ms, result } = await timed(() => completeWithTimeout(llm, request(), { timeoutMs: 50 }));

    expect(result.status).toBe('rejected');
    expect((result as PromiseRejectedResult).reason).toMatchObject({ name: 'LlmError', kind: 'timeout' });
    expect(ms).toBeGreaterThanOrEqual(45);
    expect(ms).toBeLessThan(500);
    expect(llm.signals[0]?.aborted).toBe(true); // the upstream request is cancelled, not just abandoned
  });

  it('rejects as aborted when the caller aborts (e.g. the client disconnected)', async () => {
    const parent = new AbortController();
    const llm = signalSpyLlm(hangingLlm());

    const pending = completeWithTimeout(llm, request(), { timeoutMs: 1000, signal: parent.signal });
    parent.abort();

    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
    expect(llm.signals[0]?.aborted).toBe(true);
  });

  it('wraps an unexpected model error in a typed upstream LlmError', async () => {
    const pending = completeWithTimeout(failingLlm(new Error('socket hang up')), request(), { timeoutMs: 200 });

    await expect(pending).rejects.toBeInstanceOf(LlmError);
    await expect(pending).rejects.toMatchObject({ kind: 'upstream' });
  });

  it('keeps an LlmError from the model as-is (e.g. unavailable)', async () => {
    const unavailable = new LlmError('unavailable', 'no key', { unavailableReason: 'no_api_key' });

    await expect(completeWithTimeout(failingLlm(unavailable), request(), { timeoutMs: 200 })).rejects.toBe(unavailable);
  });
});

describe('streamWithTimeout', () => {
  it('passes chunks through in order', async () => {
    await expect(collect(streamWithTimeout(fakeLlm(['a', 'b', 'c']), request(), streamTimeouts))).resolves.toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('times out when the first token never arrives', async () => {
    const { ms, result } = await timed(() => collect(streamWithTimeout(hangingLlm(), request(), streamTimeouts)));

    expect((result as PromiseRejectedResult).reason).toMatchObject({ kind: 'timeout' });
    expect(ms).toBeLessThan(500);
  });

  it('times out when the stream goes idle mid-answer, after the partial chunks were delivered', async () => {
    const received: string[] = [];

    const consume = async () => {
      for await (const chunk of streamWithTimeout(stallingLlm(['Part', 'ial']), request(), streamTimeouts)) {
        received.push(chunk);
      }
    };

    await expect(consume()).rejects.toMatchObject({ kind: 'timeout' });
    expect(received).toEqual(['Part', 'ial']);
  });

  it('allows a slow but steady stream whose total time exceeds the idle timeout', async () => {
    // 5 chunks x 25ms = 125ms total, but no single gap reaches the 60ms idle timeout.
    const llm = fakeLlm(['1', '2', '3', '4', '5'], { delayMs: 25 });

    await expect(collect(streamWithTimeout(llm, request(), streamTimeouts))).resolves.toHaveLength(5);
  });

  it('uses the first-token timeout for the first chunk and the idle timeout afterwards', async () => {
    // First chunk at ~40ms: fine with a 100ms first-token budget, though it would break a 20ms idle timeout.
    const llm = fakeLlm(['slow start', ' then fast'], { delayMs: 40 });

    const first = await collect(streamWithTimeout(llm, request(), { firstTokenMs: 100, idleMs: 20 })).catch(
      (error: unknown) => error,
    );

    // The second gap is also 40ms, which exceeds the 20ms idle budget.
    expect(first).toMatchObject({ kind: 'timeout' });
    await expect(
      collect(streamWithTimeout(fakeLlm(['a', 'b'], { delayMs: 40 }), request(), { firstTokenMs: 100, idleMs: 100 })),
    ).resolves.toEqual(['a', 'b']);
  });

  it('wraps a mid-stream model error in a typed upstream LlmError', async () => {
    const llm = failingLlm(new Error('connection reset'), ['Hel']);

    await expect(collect(streamWithTimeout(llm, request(), streamTimeouts))).rejects.toMatchObject({
      kind: 'upstream',
    });
  });

  it('aborts the upstream call when the consumer stops early', async () => {
    const llm = signalSpyLlm(fakeLlm(['a', 'b', 'c']));

    for await (const chunk of streamWithTimeout(llm, request(), streamTimeouts)) {
      if (chunk === 'a') break;
    }

    expect(llm.signals[0]?.aborted).toBe(true);
  });

  it('rejects as aborted when the caller aborts mid-stream', async () => {
    const parent = new AbortController();
    const stream = streamWithTimeout(hangingLlm(), request(), {
      firstTokenMs: 1000,
      idleMs: 1000,
      signal: parent.signal,
    });

    const pending = collect(stream);
    parent.abort();

    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
  });
});
