import dotenv from 'dotenv';
import { createApp } from './app';
import { loadConfig } from './config/config';
import { APPROVALS_FILE, ENV_FILE } from './config/paths';
import { loadApprovals } from './data/loadApprovals';
import { createLlmClient } from './llm/createLlmClient';

// The .env file lives at the repo root, shared by both apps.
dotenv.config({ path: ENV_FILE, quiet: true });

function start(): void {
  // Fail fast: bad env or seed data stops the server with a readable error, not a half-working API.
  const config = loadConfig(process.env);
  const approvals = loadApprovals(APPROVALS_FILE);
  const llm = createLlmClient(config);

  createApp().listen(config.apiPort, () => {
    console.log(
      `API listening on http://localhost:${config.apiPort} (${approvals.length} approvals loaded, LLM: ${llm.model})`,
    );
  });
}

try {
  start();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
