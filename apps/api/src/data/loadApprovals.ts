import fs from 'node:fs';
import { ApprovalQueueSchema, type ApprovalItem } from '@approvals/contracts';
import { z } from 'zod';

export class SeedDataError extends Error {
  override name = 'SeedDataError';
}

// Reads and validates the seeded queue. Throws instead of returning partial data:
// the server must refuse to start on a bad seed file rather than serve a broken queue.
export function loadApprovals(filePath: string): ApprovalItem[] {
  const raw = readFile(filePath);
  const json = parseJson(raw, filePath);
  const result = ApprovalQueueSchema.safeParse(json);

  if (!result.success) {
    throw new SeedDataError(`Invalid seed data in ${filePath}:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

function readFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (cause) {
    throw new SeedDataError(`Cannot read seed data file ${filePath}`, { cause });
  }
}

function parseJson(raw: string, filePath: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (cause) {
    throw new SeedDataError(`Seed data file ${filePath} is not valid JSON`, { cause });
  }
}
