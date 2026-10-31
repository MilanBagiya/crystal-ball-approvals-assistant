export interface PolicyChunk {
  id: string;
  title: string;
  text: string;
}

const HEADING = /^## (.+)$/;

// One chunk per "## " section. Anything before the first section (title, preamble) is not retrievable.
export function chunkPolicy(markdown: string): PolicyChunk[] {
  const chunks: PolicyChunk[] = [];
  let current: { title: string; lines: string[] } | undefined;

  const flush = () => {
    if (current)
      chunks.push({ id: slugify(current.title), title: current.title, text: current.lines.join('\n').trim() });
  };

  for (const line of markdown.split(/\r?\n/)) {
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      current = { title: heading[1]!.trim(), lines: [] };
    } else {
      current?.lines.push(line);
    }
  }
  flush();
  return chunks;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
