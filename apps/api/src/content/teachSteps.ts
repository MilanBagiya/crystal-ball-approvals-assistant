// Static "Teach me" guide, shown when the LLM is unavailable. Kept consistent with data/policy.md
// (a test checks that every time limit quoted here appears in the policy).

export interface TeachStep {
  title: string;
  detail: string;
}

export const TEACH_STEPS: readonly TeachStep[] = [
  {
    title: 'Check the deadline',
    detail: 'Safety and sensor items must be reviewed within 24 hours; everything else within 72 hours.',
  },
  {
    title: 'Open the item and check it by type',
    detail:
      'Folders: every file opens and is named correctly. Videos: plays fully, 720p or better, faces blurred. ' +
      'PDFs: searchable, with a version and revision date. Images: correct orientation, scale and zone labels.',
  },
  {
    title: 'Apply the safety rules',
    detail:
      'Safety and sensor specs must list the model, calibration date, next due date and an owner. ' +
      'A calibration older than 12 months cannot be approved.',
  },
  {
    title: 'Decide',
    detail:
      'Approve when every check passes. Request changes for small, clear fixes and list each one. ' +
      'Reject duplicates, items for another site, or personal data that cannot be redacted.',
  },
  {
    title: 'Escalate if needed',
    detail:
      'Safety item near its deadline or an expired calibration: the Site Safety Lead. ' +
      'Stuck for more than 72 hours or cannot be opened: the Digital Twin Admin.',
  },
];

export function formatTeachFallback(): string {
  const steps = TEACH_STEPS.map((step, index) => `${index + 1}. ${step.title}: ${step.detail}`).join('\n');
  return `Here's how to review an approval, step by step:\n\n${steps}\n\nWhich step would you like to go through in more detail?`;
}
