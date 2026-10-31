import { LlmError, toFallbackReason } from '../../src/llm/errors';
import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import { collect, request } from '../fakes/fakeLlm';

describe('toFallbackReason', () => {
  it.each([
    [new LlmError('timeout', 'slow'), 'timeout'],
    [new LlmError('unavailable', 'no key', { unavailableReason: 'no_api_key' }), 'no_api_key'],
    [new LlmError('unavailable', 'forced', { unavailableReason: 'forced' }), 'forced'],
    [new LlmError('upstream', '500 from provider'), 'llm_error'],
    [new Error('something unexpected'), 'llm_error'],
    ['not even an error', 'llm_error'],
  ])('maps %p to %s', (error, reason) => {
    expect(toFallbackReason(error)).toBe(reason);
  });
});

describe('UnavailableLlmClient', () => {
  const signal = new AbortController().signal;

  it('rejects completeText with a typed unavailable error carrying the reason', async () => {
    const llm = new UnavailableLlmClient('no_api_key');

    await expect(llm.completeText(request(), signal)).rejects.toMatchObject({
      name: 'LlmError',
      kind: 'unavailable',
      unavailableReason: 'no_api_key',
    });
  });

  it('fails the stream before yielding anything', async () => {
    const llm = new UnavailableLlmClient('forced');

    await expect(collect(llm.streamText(request(), signal))).rejects.toMatchObject({
      kind: 'unavailable',
      unavailableReason: 'forced',
    });
  });
});
