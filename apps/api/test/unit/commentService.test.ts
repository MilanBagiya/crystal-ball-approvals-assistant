import fs from 'node:fs';
import { CommentDraftResponseSchema } from '@approvals/contracts';
import { POLICY_FILE } from '../../src/config/paths';
import { commentTemplate } from '../../src/domain/commentTemplate';
import { chunkPolicy } from '../../src/domain/policyChunks';
import { createLlmRunner } from '../../src/llm/llmRunner';
import type { LlmClient } from '../../src/llm/LlmClient';
import { UnavailableLlmClient } from '../../src/llm/UnavailableLlmClient';
import { createCommentService } from '../../src/services/commentService';
import { seedApprovals } from '../fixtures/approvals';
import { failingLlm, fakeLlm, hangingLlm } from '../fakes/fakeLlm';

const policyChunks = chunkPolicy(fs.readFileSync(POLICY_FILE, 'utf8'));
const video = seedApprovals().find((i) => i.id === 'a2')!;
const NOTES = 'Faces visible at 0:42; resolution looks low.';

function draft(llm: LlmClient, notes: string | undefined = NOTES, decision: 'request_changes' | 'reject' = 'request_changes') {
  const runner = createLlmRunner({ llm, timeoutMs: 50, logUsage: () => undefined });
  return createCommentService({ runner, policyChunks }).draft({ item: video, decision, ...(notes ? { notes } : {}) });
}

describe('commentTemplate', () => {
  it('addresses the submitter by first name, names the item and includes the reviewer notes', () => {
    const text = commentTemplate({ item: video, decision: 'request_changes', notes: NOTES });

    expect(text).toMatch(/^Hi Alex,/);
    expect(text).toContain('"Level 2 Drone Patrol Video Demo"');
    expect(text).toContain(NOTES);
  });

  it('says plainly whether the item is rejected or needs changes', () => {
    expect(commentTemplate({ item: video, decision: 'reject' })).toMatch(/rejecting it/);
    expect(commentTemplate({ item: video, decision: 'request_changes' })).toMatch(/needs some changes/);
  });
});

describe('commentService', () => {
  it('returns the AI draft when it is valid', async () => {
    const comment = 'Hi Alex, thanks for the demo video. Please blur the faces visible at 0:42 and re-export it at 720p or higher.';

    const result = CommentDraftResponseSchema.parse(await draft(fakeLlm([JSON.stringify({ comment })])));

    expect(result).toEqual({ comment, source: 'ai' });
  });

  it('gives the model the reviewer notes, the item and the relevant policy, with the notes fenced as user text', async () => {
    const llm = fakeLlm(['{}']);
    await draft(llm);

    const prompt = llm.requests[0]?.messages.at(-1)?.content ?? '';
    expect(prompt).toMatch(/<notes>\s*Faces visible at 0:42; resolution looks low\.\s*<\/notes>/);
    expect(prompt).toContain('Level 2 Drone Patrol Video Demo');
    expect(prompt).toContain('[content-checks-by-type]');
  });

  it.each([
    ['text that is not JSON', 'Hi Alex, please fix the video.'],
    ['a comment over 1000 characters', JSON.stringify({ comment: `Hi Alex, ${'please '.repeat(200)}` })],
    // 1080p is in neither the notes nor the policy: the model must not invent requirements.
    ['a comment with a number from nowhere', JSON.stringify({ comment: 'Hi Alex, please re-export at 1080p.' })],
  ])('uses the template for %s', async (_label, output) => {
    const result = await draft(fakeLlm([output]));

    expect(result).toEqual({ comment: commentTemplate({ item: video, decision: 'request_changes', notes: NOTES }), source: 'template' });
  });

  it.each([
    ['a timeout', hangingLlm()],
    ['a model error', failingLlm(new Error('500'))],
    ['no API key', new UnavailableLlmClient('no_api_key')],
  ])('uses the template on %s', async (_label, llm) => {
    expect((await draft(llm)).source).toBe('template');
  });
});
