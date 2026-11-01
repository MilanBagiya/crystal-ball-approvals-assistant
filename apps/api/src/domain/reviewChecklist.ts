import type { ApprovalType, ReviewCheck } from '@approvals/contracts';
import type { RankedApproval } from './urgency';

// The deterministic review checklist, taken from data/policy.md. It is the fallback for the AI pre-review,
// and the deadline and policy sections here are facts the AI is never asked to decide.

const CONTENT = 'content-checks-by-type';
const SAFETY = 'safety-and-sensor-specifications';
const DECISION = 'approve-reject-or-request-changes';

const TYPE_CHECKS: Record<ApprovalType, readonly string[]> = {
  folder: ['Every file opens', 'Names follow the site naming convention', 'No duplicate or empty files'],
  video: ['Plays end to end', 'Is at least 720p', 'No faces or licence plates left unblurred'],
  pdf: ['Text is searchable', 'Version number and revision date are on the cover', 'Every page is legible'],
  image: ['Orientation is correct', 'A scale or north arrow is visible', 'Zone labels match the twin'],
};

const SAFETY_CHECKS: readonly string[] = [
  'Lists the equipment model, calibration date, next due date and a named owner',
  'Calibration is no older than 12 months',
  'States the operating range and any alarm thresholds',
];

export function reviewDeadline({ tier }: RankedApproval): string {
  return tier === 'safety' ? 'Review within 24 hours (safety item)' : 'Review within 72 hours';
}

/** The policy sections that apply to an item: what the AI is given, and what its checks may cite. */
export function relevantChunkIds({ tier }: RankedApproval): string[] {
  return tier === 'safety' ? [CONTENT, SAFETY, DECISION] : [CONTENT, DECISION];
}

export function fallbackChecklist(ranked: RankedApproval): ReviewCheck[] {
  const { item, tier } = ranked;
  return [
    ...TYPE_CHECKS[item.type].map((check) => ({
      check,
      why: `The approval policy requires this for every ${item.type}.`,
      chunkId: CONTENT,
    })),
    ...(tier === 'safety'
      ? SAFETY_CHECKS.map((check) => ({
          check,
          why: 'Required for safety and sensor specifications.',
          chunkId: SAFETY,
        }))
      : []),
    {
      check: 'The item sits in the correct path',
      why: 'Approve only when every check passes and the item is in the correct path.',
      chunkId: DECISION,
    },
  ];
}
