import type { ApprovalItem } from '@approvals/contracts';

export interface CommentInput {
  item: ApprovalItem;
  decision: 'request_changes' | 'reject';
  notes?: string;
}

/** The deterministic comment to a submitter: the fallback for the AI draft, and complete on its own. */
export function commentTemplate({ item, decision, notes }: CommentInput): string {
  const firstName = item.submittedBy.split(' ')[0] ?? item.submittedBy;
  const verdict = decision === 'reject' ? "I'm rejecting it" : 'It needs some changes before it can be approved';
  const section = decision === 'reject' ? 'Approve, reject or request changes' : 'Content checks by type';
  const reason = notes ? `: ${notes}` : '.';
  return `Hi ${firstName}, thanks for submitting "${item.title}". ${verdict}${reason} See the "${section}" section of the approval policy for details.`;
}
