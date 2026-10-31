import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { APPROVALS_FILE, POLICY_FILE } from '../../src/config/paths';
import { loadApprovals, SeedDataError } from '../../src/data/loadApprovals';

function writeTempJson(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'approvals-seed-'));
  const file = path.join(dir, 'approvals.json');
  fs.writeFileSync(file, content);
  return file;
}

describe('data/approvals.json', () => {
  it('loads the four seeded items exactly as specified', () => {
    const items = loadApprovals(APPROVALS_FILE);

    expect(items.map(({ id, type, title }) => ({ id, type, title }))).toEqual([
      { id: 'a1', type: 'folder', title: 'Site Patrol Onboarding & Checklists' },
      { id: 'a2', type: 'video', title: 'Level 2 Drone Patrol Video Demo' },
      { id: 'a3', type: 'pdf', title: 'Safety Equipment & Sensor Specs' },
      { id: 'a4', type: 'image', title: '360° Spatial Zone Layout & Camera Map' },
    ]);
    expect(items.every((item) => item.status === 'pending_review' && item.submittedAt === '2026-09-18')).toBe(true);
  });
});

describe('loadApprovals', () => {
  it('refuses a schema-invalid file with an error naming the file and the bad field', () => {
    const file = writeTempJson(JSON.stringify([{ id: 'x1', title: 'Broken', type: 'spreadsheet' }]));

    expect(() => loadApprovals(file)).toThrow(SeedDataError);
    expect(() => loadApprovals(file)).toThrow(file);
    expect(() => loadApprovals(file)).toThrow(/type/);
  });

  it('refuses a file that is not valid JSON', () => {
    const file = writeTempJson('[{ "id": "a1", ');

    expect(() => loadApprovals(file)).toThrow(SeedDataError);
    expect(() => loadApprovals(file)).toThrow(/not valid JSON/);
  });

  it('refuses a missing file with a clear message', () => {
    expect(() => loadApprovals(path.join(os.tmpdir(), 'does-not-exist.json'))).toThrow(/Cannot read/);
  });
});

describe('data/policy.md', () => {
  const policy = fs.readFileSync(POLICY_FILE, 'utf8');

  it('has exactly five ## sections, one per retrieval chunk', () => {
    const headings = policy.match(/^## .+$/gm) ?? [];

    expect(headings).toEqual([
      '## Review SLAs',
      '## Content checks by type',
      '## Approve, reject or request changes',
      '## Safety and sensor specifications',
      '## Escalation',
    ]);
  });

  it('is 250 to 350 words long', () => {
    const words = policy
      .replace(/[#*`>-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean).length;

    expect(words).toBeGreaterThanOrEqual(250);
    expect(words).toBeLessThanOrEqual(350);
  });
});
