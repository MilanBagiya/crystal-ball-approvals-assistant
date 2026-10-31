import { LlmError } from '../../src/llm/errors';
import { createLlmRunner } from '../../src/llm/llmRunner';
import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import { createConsoleUsageLogger, type UsageRecord } from '../../src/llm/usageLog';
import { collect, failingLlm, fakeLlm, hangingLlm, request } from '../fakes/fakeLlm';

const prompt = { id: 'summary', version: '1.0.0' };

function setup(llm: Parameters<typeof createLlmRunner>[0]['llm']) {
  const records: UsageRecord[] = [];
  let clock = 1_000;
  const runner = createLlmRunner({
    llm,
    timeoutMs: 50,
    logUsage: (record) => records.push(record),
    // Each call to now() advances 250ms, so latency is deterministic.
    now: () => (clock += 250),
  });
  return { runner, records };
}

describe('createConsoleUsageLogger', () => {
  it('writes each record as exactly one line of JSON', () => {
    const lines: string[] = [];
    const log = createConsoleUsageLogger((line) => lines.push(line));

    log({
      promptId: 'summary',
      promptVersion: '1.0.0',
      model: 'm',
      inputTokens: 10,
      outputTokens: 20,
      latencyMs: 300,
      outcome: 'ok',
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('\n');
    expect(JSON.parse(lines[0]!)).toMatchObject({
      event: 'llm_call',
      promptId: 'summary',
      promptVersion: '1.0.0',
      model: 'm',
      inputTokens: 10,
      outputTokens: 20,
      latencyMs: 300,
      outcome: 'ok',
    });
  });
});

describe('llmRunner usage logging', () => {
  it('logs a successful completion with model, tokens and latency', async () => {
    const { runner, records } = setup(fakeLlm(['{"greeting":"hi"}'], { usage: { inputTokens: 12, outputTokens: 34 } }));

    await expect(runner.complete(request(), { prompt })).resolves.toBe('{"greeting":"hi"}');

    expect(records).toEqual([
      {
        promptId: 'summary',
        promptVersion: '1.0.0',
        model: 'fake-model',
        inputTokens: 12,
        outputTokens: 34,
        latencyMs: 250,
        outcome: 'ok',
      },
    ]);
  });

  it('logs a timeout and still rethrows the typed error for the caller to fall back on', async () => {
    const { runner, records } = setup(hangingLlm());

    await expect(runner.complete(request(), { prompt })).rejects.toMatchObject({ kind: 'timeout' });
    expect(records).toMatchObject([{ outcome: 'timeout', inputTokens: 0, outputTokens: 0 }]);
  });

  it('logs "unavailable" when there is no API key', async () => {
    const { runner, records } = setup(new UnavailableLlmClient('no_api_key'));

    await expect(runner.complete(request(), { prompt })).rejects.toBeInstanceOf(LlmError);
    expect(records).toMatchObject([{ outcome: 'unavailable', model: 'unavailable' }]);
  });

  it('logs a stream once, after it finishes, with the reported tokens', async () => {
    const { runner, records } = setup(fakeLlm(['a', 'b'], { usage: { inputTokens: 5, outputTokens: 2 } }));
    const stream = runner.stream(request(), { prompt });

    expect(records).toHaveLength(0); // nothing is logged before the stream is consumed

    await expect(collect(stream)).resolves.toEqual(['a', 'b']);
    expect(records).toMatchObject([{ outcome: 'ok', inputTokens: 5, outputTokens: 2 }]);
  });

  it('logs "error" once when a stream fails midway', async () => {
    const { runner, records } = setup(failingLlm(new Error('reset'), ['a']));

    await expect(collect(runner.stream(request(), { prompt }))).rejects.toMatchObject({ kind: 'upstream' });
    expect(records).toMatchObject([{ outcome: 'error' }]);
  });

  it('logs "aborted" when the consumer stops reading early', async () => {
    const { runner, records } = setup(fakeLlm(['a', 'b', 'c']));

    for await (const chunk of runner.stream(request(), { prompt })) {
      if (chunk === 'a') break;
    }

    expect(records).toMatchObject([{ outcome: 'aborted' }]);
  });

  it("still calls the caller's own onUsage callback", async () => {
    const { runner } = setup(fakeLlm(['x'], { usage: { inputTokens: 1, outputTokens: 1 } }));
    const onUsage = jest.fn();

    await runner.complete(request({ onUsage }), { prompt });

    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 1, outputTokens: 1 });
  });
});
