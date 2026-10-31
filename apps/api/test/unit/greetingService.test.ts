import { createLlmRunner } from '../../src/llm/llmRunner';
import type { LlmClient } from '../../src/llm/LlmClient';
import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import type { LogEntry } from '../../src/logging/logger';
import { createGreetingService } from '../../src/services/greetingService';
import { seedApprovals } from '../fixtures/approvals';
import { failingLlm, fakeLlm, hangingLlm } from '../fakes/fakeLlm';

const TEMPLATE = 'Good afternoon! You have 4 items waiting for review, including 1 safety document.';

function service(llm: LlmClient) {
  const logs: LogEntry[] = [];
  const runner = createLlmRunner({ llm, timeoutMs: 50, logUsage: () => undefined });
  const greeting = createGreetingService({ runner, approvals: seedApprovals(), logger: { log: (e) => logs.push(e) } });
  return { greet: () => greeting.greet({ localTime: '14:05' }), logs };
}

describe('greetingService', () => {
  it('returns the model greeting with source "ai" when its JSON is valid', async () => {
    const { greet } = service(
      fakeLlm(['{"greeting":"Good afternoon! 4 items need you today, 1 is safety-critical."}']),
    );

    await expect(greet()).resolves.toEqual({
      greeting: 'Good afternoon! 4 items need you today, 1 is safety-critical.',
      source: 'ai',
    });
  });

  it('accepts valid JSON wrapped in a markdown code fence', async () => {
    const { greet } = service(fakeLlm(['```json\n{"greeting":"Hi! 4 items are waiting."}\n```']));

    await expect(greet()).resolves.toEqual({ greeting: 'Hi! 4 items are waiting.', source: 'ai' });
  });

  it('sends the deterministic template to the model to reword', async () => {
    const llm = fakeLlm(['{"greeting":"Hi! 4 items."}']);
    await service(llm).greet();

    expect(llm.requests[0]?.messages.at(-1)?.content).toContain(TEMPLATE);
  });

  it.each([
    ['text that is not JSON', 'Good afternoon, you have 4 items!'],
    ['JSON with the wrong shape', '{"message":"Hi! 4 items."}'],
    ['a greeting over 220 characters', JSON.stringify({ greeting: `Hi! ${'very '.repeat(60)}busy.` })],
    ['an empty greeting', '{"greeting":""}'],
    // The model must not change the facts: 5 is not a number the template contains.
    ['a greeting that changes a number', '{"greeting":"Good afternoon! You have 5 items waiting."}'],
  ])('falls back to the template for %s', async (_label, output) => {
    const { greet, logs } = service(fakeLlm([output]));

    await expect(greet()).resolves.toEqual({ greeting: TEMPLATE, source: 'template' });
    expect(logs).toMatchObject([{ level: 'warn', event: 'greeting_fallback', reason: 'invalid_output' }]);
  });

  it.each([
    ['a timeout', hangingLlm(), 'timeout'],
    ['a model error', failingLlm(new Error('500')), 'llm_error'],
    ['no API key', new UnavailableLlmClient('no_api_key'), 'no_api_key'],
  ])('falls back to the template on %s', async (_label, llm, reason) => {
    const { greet, logs } = service(llm);

    await expect(greet()).resolves.toEqual({ greeting: TEMPLATE, source: 'template' });
    expect(logs).toMatchObject([{ event: 'greeting_fallback', reason }]);
  });
});
