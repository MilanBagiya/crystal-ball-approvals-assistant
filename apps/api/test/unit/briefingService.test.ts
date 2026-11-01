import { buildDashboard, briefingTemplate } from '../../src/domain/dashboard';
import { createLlmRunner } from '../../src/llm/llmRunner';
import type { LlmClient } from '../../src/llm/LlmClient';
import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import { createBriefingService } from '../../src/services/briefingService';
import { seedApprovals } from '../fixtures/approvals';
import { failingLlm, fakeLlm, hangingLlm } from '../fakes/fakeLlm';

const NOW = new Date('2026-09-19T12:00:00.000Z');
const dashboard = buildDashboard(seedApprovals(), NOW);
const TEMPLATE = briefingTemplate(dashboard);

function brief(llm: LlmClient) {
  const runner = createLlmRunner({ llm, timeoutMs: 50, logUsage: () => undefined });
  return createBriefingService({ runner }).brief(dashboard);
}

describe('briefingService', () => {
  it('returns the AI briefing when it keeps to the computed facts', async () => {
    const briefing =
      'Good morning! 4 items wait for you and 1 is already overdue: start with Safety Equipment & Sensor Specs, 12 hours late.';

    await expect(brief(fakeLlm([JSON.stringify({ briefing })]))).resolves.toEqual({ briefing, source: 'ai' });
  });

  it('gives the model the computed facts, not raw dates to do arithmetic on', async () => {
    const llm = fakeLlm(['{}']);
    await brief(llm);

    const prompt = llm.requests[0]?.messages.at(-1)?.content ?? '';
    expect(prompt).toContain('"pending":4');
    expect(prompt).toContain('"overdue":1');
    expect(prompt).toContain('"hoursLeft":-12');
    expect(prompt).toContain(TEMPLATE);
  });

  it.each([
    ['text that is not JSON', 'You have 4 items.'],
    // 3 is not one of the computed numbers: the model must not do its own counting.
    ['a briefing with a number that is not in the facts', JSON.stringify({ briefing: '3 items are overdue.' })],
    ['a briefing over 500 characters', JSON.stringify({ briefing: `4 items. ${'Busy day. '.repeat(60)}` })],
    // Code decides where to start; a local model once sent the reviewer to the wrong (less overdue) item.
    [
      'a briefing that starts with a different item',
      JSON.stringify({ briefing: '4 items are waiting, 1 overdue. Start with Level 2 Drone Patrol Video Demo.' }),
    ],
  ])('uses the template for %s', async (_label, output) => {
    await expect(brief(fakeLlm([output]))).resolves.toEqual({ briefing: TEMPLATE, source: 'template' });
  });

  it.each([
    ['a timeout', hangingLlm()],
    ['a model error', failingLlm(new Error('500'))],
    ['no API key', new UnavailableLlmClient('no_api_key')],
  ])('uses the template on %s', async (_label, llm) => {
    await expect(brief(llm)).resolves.toEqual({ briefing: TEMPLATE, source: 'template' });
  });
});
