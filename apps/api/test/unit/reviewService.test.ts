import fs from 'node:fs';
import { ReviewResponseSchema } from '@approvals/contracts';
import { POLICY_FILE } from '../../src/config/paths';
import { chunkPolicy } from '../../src/domain/policyChunks';
import { createLlmRunner } from '../../src/llm/llmRunner';
import type { LlmClient } from '../../src/llm/LlmClient';
import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import { createReviewService } from '../../src/services/reviewService';
import { seedApprovals } from '../fixtures/approvals';
import { failingLlm, fakeLlm, hangingLlm } from '../fakes/fakeLlm';

const policyChunks = chunkPolicy(fs.readFileSync(POLICY_FILE, 'utf8'));
const item = (id: string) => seedApprovals().find((i) => i.id === id)!;

function review(llm: LlmClient, id: string) {
  const runner = createLlmRunner({ llm, timeoutMs: 50, logUsage: () => undefined });
  return createReviewService({ runner, policyChunks }).review(item(id));
}

const check = (text: string, chunkId = 'content-checks-by-type', why = 'Required by the approval policy.') => ({
  check: text,
  why,
  chunkId,
});
const modelReply = (checks: unknown[]) => JSON.stringify({ checks });

describe('reviewService', () => {
  it('returns the model checklist, with the deadline decided in code', async () => {
    const llm = fakeLlm([
      modelReply([
        check('Confirm the PDF lists the equipment model and calibration date', 'safety-and-sensor-specifications'),
        check('Check the revision date on the cover'),
        check('Make sure every page is legible'),
      ]),
    ]);

    const result = ReviewResponseSchema.parse(await review(llm, 'a3'));

    expect(result).toMatchObject({ itemId: 'a3', source: 'ai', deadline: 'Review within 24 hours (safety item)' });
    expect(result.checks).toHaveLength(3);
  });

  it('gives the model only the policy sections that apply, adding the safety rules only for safety items', async () => {
    const safety = fakeLlm(['{}']);
    const video = fakeLlm(['{}']);
    await review(safety, 'a3');
    await review(video, 'a2');

    const safetyPrompt = safety.requests[0]?.messages.at(-1)?.content ?? '';
    const videoPrompt = video.requests[0]?.messages.at(-1)?.content ?? '';
    expect(safetyPrompt).toContain('[safety-and-sensor-specifications]');
    expect(videoPrompt).not.toContain('[safety-and-sensor-specifications]');
    expect(videoPrompt).toContain('[content-checks-by-type]');
    expect(videoPrompt).toContain('Level 2 Drone Patrol Video Demo');
  });

  it('never asks the model for a verdict: it only sees metadata, not the file', async () => {
    const llm = fakeLlm(['{}']);
    await review(llm, 'a2');

    expect(llm.requests[0]?.system).toMatch(/do not decide whether to approve or reject/i);
  });

  it('drops checks that cite a policy section it was not given, or quote numbers the policy does not contain', async () => {
    const llm = fakeLlm([
      modelReply([
        check('Plays end to end'),
        check('At least 720p resolution'),
        check('Approved by the CEO within 2 hours', 'made-up-section'),
        check('At least 1080p resolution'),
      ]),
    ]);

    const result = await review(llm, 'a2');

    expect(result.source).toBe('ai');
    expect(result.checks.map((c) => c.check)).toEqual(['Plays end to end', 'At least 720p resolution']);
  });

  it('accepts the JSON object wrapped in a one-item array, a common small-model habit, still fully validated', async () => {
    const wrapped = `[\n${modelReply([check('Plays end to end'), check('At least 720p resolution')])}\n]`;

    const result = await review(fakeLlm([wrapped]), 'a2');

    expect(result).toMatchObject({
      source: 'ai',
      checks: [{ check: 'Plays end to end' }, { check: 'At least 720p resolution' }],
    });
  });

  it('falls back to the policy checklist when too few valid checks are left', async () => {
    const result = await review(fakeLlm([modelReply([check('Only one check')])]), 'a2');

    expect(result).toMatchObject({ source: 'fallback', fallbackReason: 'invalid_output' });
  });

  it.each([
    ['text that is not JSON', fakeLlm(['Here is your checklist: ...']), 'invalid_output'],
    ['a timeout', hangingLlm(), 'timeout'],
    ['a model error', failingLlm(new Error('500')), 'llm_error'],
    ['no API key', new UnavailableLlmClient('no_api_key'), 'no_api_key'],
  ])('falls back to the policy checklist for %s', async (_label, llm, reason) => {
    const result = ReviewResponseSchema.parse(await review(llm, 'a2'));

    expect(result).toMatchObject({ source: 'fallback', fallbackReason: reason, deadline: 'Review within 72 hours' });
    expect(result.checks.map((c) => c.check)).toContain('Plays end to end');
  });
});
