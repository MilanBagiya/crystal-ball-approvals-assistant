import type { ReactNode } from 'react';

const BOLD = /(\*\*[^*\n]+\*\*)/g;

/**
 * Renders `**bold**` spans from model text as <strong>. Models use bold even when asked for plain text.
 * Everything else stays plain text: no HTML is ever interpreted, so model output can't inject markup.
 * An unclosed `**` (mid-stream) is left as-is until its closing pair arrives.
 */
export function renderInlineBold(text: string): ReactNode[] {
  return text
    .split(BOLD)
    .filter(Boolean)
    .map((part, i) =>
      part.length > 4 && part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    );
}
