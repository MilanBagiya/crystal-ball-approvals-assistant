import fs from 'node:fs';
import type { StreamEvent } from '@approvals/contracts';
import { POLICY_FILE } from '../../src/config/paths';
import { chunkPolicy } from '../../src/domain/policyChunks';
import { createLlmRunner } from '../../src/llm/llmRunner';
import type { LlmClient } from '../../src/llm/LlmClient';
import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import type { UsageRecord } from '../../src/llm/usageLog';
import { createHelpService, POLICY_NOT_COVERED } from '../../src/services/helpService';
import { failingLlm, fakeLlm } from '../fakes/fakeLlm';

const policyChunks = chunkPolicy(fs.readFileSync(POLICY_FILE, 'utf8'));

async function ask(llm: LlmClient, question: string, messages?: { role: 'user' | 'assistant'; content: string }[]) {
  const usage: UsageRecord[] = [];
  const runner = createLlmRunner({ llm, timeoutMs: 50, logUsage: (r) => usage.push(r) });
  const help = createHelpService({ runner, policyChunks });
  const events: StreamEvent[] = [];
  const input = messages ? { question, messages } : { question };
  for await (const event of help.stream(input, new AbortController().signal)) events.push(event);
  return { events, usage };
}

describe('helpService', () => {
  it('does not call the LLM when the question is not about the policy', async () => {
    const llm = fakeLlm(['should never be used']);

    const { events, usage } = await ask(llm, 'What is the weather in Paris tomorrow?');

    expect(llm.requests).toHaveLength(0);
    expect(usage).toHaveLength(0);
    expect(events).toEqual([{ type: 'token', text: POLICY_NOT_COVERED }]);
    expect(POLICY_NOT_COVERED).toMatch(/^The policy doesn't cover this\./);
  });

  it('sends the sources first, then the streamed answer', async () => {
    const { events } = await ask(
      fakeLlm(['Specs must list ', 'the calibration date [safety-and-sensor-specifications].']),
      'What do safety specs need to include?',
    );

    expect(events[0]).toEqual({ type: 'sources', chunkIds: ['safety-and-sensor-specifications', 'review-slas'] });
    expect(events.slice(1)).toEqual([
      { type: 'token', text: 'Specs must list ' },
      { type: 'token', text: 'the calibration date [safety-and-sensor-specifications].' },
    ]);
  });

  it('puts only the retrieved chunks in the prompt', async () => {
    const llm = fakeLlm(['ok']);

    await ask(llm, 'Who do I escalate an expired calibration to?');

    const prompt = llm.requests[0]?.messages.at(-1)?.content ?? '';
    expect(prompt).toContain('[escalation]');
    expect(prompt).toContain('[safety-and-sensor-specifications]');
    expect(prompt).not.toContain('[content-checks-by-type]');
    expect(prompt).toContain('Who do I escalate an expired calibration to?');
  });

  it('includes earlier turns before the new question, dropping a leading assistant turn', async () => {
    const llm = fakeLlm(['ok']);

    await ask(llm, 'And for safety documents?', [
      { role: 'assistant', content: 'Hi! Ask me about the policy.' },
      { role: 'user', content: 'What is the review SLA?' },
      { role: 'assistant', content: '72 hours for most items [review-slas].' },
    ]);

    expect(llm.requests[0]?.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('falls back to the retrieved policy text, labelled, when the LLM is unavailable', async () => {
    const { events } = await ask(
      new UnavailableLlmClient('no_api_key'),
      'Who do I escalate an expired calibration to?',
    );

    expect(events[0]).toMatchObject({ type: 'sources' });
    expect(events[1]).toMatchObject({ type: 'fallback', reason: 'no_api_key' });
    const content = events[1]?.type === 'fallback' ? events[1].content : '';
    expect(content).toMatch(/^From the policy:/);
    expect(content).toContain('Escalate to the Site Safety Lead');
  });

  it('keeps partial text and adds the policy fallback when the model fails mid-answer', async () => {
    const { events } = await ask(failingLlm(new Error('reset'), ['Escalate to ']), 'What is the escalation process?');

    expect(events.map((e) => e.type)).toEqual(['sources', 'token', 'fallback']);
    expect(events[2]).toMatchObject({ reason: 'llm_error' });
  });
});
