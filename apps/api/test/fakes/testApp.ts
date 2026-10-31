import fs from 'node:fs';
import type { Express } from 'express';
import { createApp, type AppDeps } from '../../src/app';
import { POLICY_FILE } from '../../src/config/paths';
import { chunkPolicy } from '../../src/domain/policyChunks';
import type { UsageRecord } from '../../src/llm/usageLog';
import type { LogEntry } from '../../src/logging/logger';
import { seedApprovals } from '../fixtures/approvals';
import { fakeLlm } from './fakeLlm';

export interface TestApp {
  app: Express;
  usage: UsageRecord[];
  logs: LogEntry[];
}

// A real app with seeded data and a fake LLM. Short timeout and a generous rate limit by default.
export function buildTestApp(overrides: Partial<AppDeps> = {}): TestApp {
  const usage: UsageRecord[] = [];
  const logs: LogEntry[] = [];
  const app = createApp({
    llm: fakeLlm([]),
    approvals: seedApprovals(),
    policyChunks: chunkPolicy(fs.readFileSync(POLICY_FILE, 'utf8')),
    config: { llmTimeoutMs: 50, rateLimitPerMin: 1000 },
    logUsage: (record) => usage.push(record),
    logger: { log: (entry) => logs.push(entry) },
    ...overrides,
  });
  return { app, usage, logs };
}
