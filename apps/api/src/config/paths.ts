import path from 'node:path';

// Resolved from this file (apps/api/src/config) so it works regardless of the process's cwd.
export const REPO_ROOT = path.resolve(__dirname, '../../../..');
export const DATA_DIR = path.join(REPO_ROOT, 'data');
export const APPROVALS_FILE = path.join(DATA_DIR, 'approvals.json');
export const POLICY_FILE = path.join(DATA_DIR, 'policy.md');
export const ENV_FILE = path.join(REPO_ROOT, '.env');
