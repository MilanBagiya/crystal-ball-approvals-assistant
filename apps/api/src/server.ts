import fs from 'node:fs';
import dotenv from 'dotenv';
import { createApp } from './app';
import { loadConfig } from './config/config';
import { APPROVALS_FILE, ENV_FILE, POLICY_FILE } from './config/paths';
import { loadApprovals } from './data/loadApprovals';
import { chunkPolicy } from './domain/policyChunks';
import { createLlmClient } from './llm/createLlmClient';
import { createConsoleUsageLogger } from './llm/usageLog';
import { createJsonLogger } from './logging/logger';

// The .env file lives at the repo root, shared by both apps.
dotenv.config({ path: ENV_FILE, quiet: true });

function start(): void {
  // Fail fast: bad env or seed data stops the server with a readable error, not a half-working API.
  const config = loadConfig(process.env);
  const approvals = loadApprovals(APPROVALS_FILE);
  const policyChunks = chunkPolicy(fs.readFileSync(POLICY_FILE, 'utf8'));
  const llm = createLlmClient(config);

  const app = createApp({
    llm,
    approvals,
    policyChunks,
    config,
    logUsage: createConsoleUsageLogger(),
    logger: createJsonLogger(),
  });

  app.listen(config.apiPort, () => {
    console.log(
      `API listening on http://localhost:${config.apiPort} (${approvals.length} approvals, ` +
        `${policyChunks.length} policy chunks, LLM: ${llm.model})`,
    );
  });
}

try {
  start();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
