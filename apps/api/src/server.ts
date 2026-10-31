import dotenv from 'dotenv';
import { createApp } from './app';
import { APPROVALS_FILE, ENV_FILE } from './config/paths';
import { loadApprovals } from './data/loadApprovals';

// The .env file lives at the repo root, shared by both apps.
dotenv.config({ path: ENV_FILE, quiet: true });

function start(): void {
  // Fail fast: an invalid seed file stops the server with a readable error, not a half-working API.
  const approvals = loadApprovals(APPROVALS_FILE);
  const port = Number(process.env.API_PORT ?? 4000);

  createApp().listen(port, () => {
    console.log(`API listening on http://localhost:${port} (${approvals.length} approvals loaded)`);
  });
}

try {
  start();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
