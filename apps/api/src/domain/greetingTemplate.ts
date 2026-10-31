import type { ApprovalItem } from '@approvals/contracts';
import { rankApprovals } from './urgency';

export type PartOfDay = 'morning' | 'afternoon' | 'evening';

// localTime is the browser's HH:MM (already validated by GreetingRequestSchema).
export function partOfDay(localTime: string | undefined): PartOfDay | undefined {
  if (!localTime) return undefined;
  const hour = Number(localTime.slice(0, 2));
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

// The deterministic greeting. It is complete on its own; the LLM only rewords it.
export function buildGreetingTemplate(input: { items: readonly ApprovalItem[]; localTime?: string }): string {
  const time = partOfDay(input.localTime);
  const opener = time ? `Good ${time}!` : 'Hello!';
  const pending = rankApprovals(input.items);

  if (pending.length === 0) return `${opener} Your review queue is clear.`;

  const safetyCount = pending.filter((r) => r.tier === 'safety').length;
  const safetyClause = safetyCount > 0 ? `, including ${plural(safetyCount, 'safety document')}` : '';

  return `${opener} You have ${plural(pending.length, 'item')} waiting for review${safetyClause}.`;
}
