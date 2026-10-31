import type { ApprovalItem } from '@approvals/contracts';
import cors from 'cors';
import express, { type Express } from 'express';
import type { AppConfig } from './config/config';
import type { PolicyChunk } from './domain/policyChunks';
import { errorHandler, notFoundHandler } from './http/errorHandler';
import type { LlmClient } from './llm/LlmClient';
import { createLlmRunner } from './llm/llmRunner';
import type { UsageLogger } from './llm/usageLog';
import type { Logger } from './logging/logger';
import { aiRoutes, type AiServices } from './routes/ai';
import { systemRoutes } from './routes/system';
import { createGreetingService } from './services/greetingService';
import { createHelpService } from './services/helpService';
import { createSummaryService } from './services/summaryService';

export interface AppDeps {
  llm: LlmClient;
  approvals: readonly ApprovalItem[];
  policyChunks: readonly PolicyChunk[];
  config: Pick<AppConfig, 'llmTimeoutMs' | 'rateLimitPerMin'>;
  logUsage: UsageLogger;
  logger: Logger;
}

// App factory: everything external is injected, so Supertest builds an app with fakes and no network.
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  // The browser goes through the Next.js proxy (same origin); this only allows calling the API directly in dev.
  app.use(cors({ origin: 'http://localhost:3000' }));
  app.use(express.json({ limit: '32kb' }));

  const runner = createLlmRunner({ llm: deps.llm, timeoutMs: deps.config.llmTimeoutMs, logUsage: deps.logUsage });
  const services: AiServices = {
    greeting: createGreetingService({ runner, approvals: deps.approvals, logger: deps.logger }),
    summary: createSummaryService({ runner, approvals: deps.approvals, logger: deps.logger }),
    help: createHelpService({ runner, policyChunks: deps.policyChunks }),
  };

  app.use('/api', systemRoutes(deps));
  app.use('/api/ai', aiRoutes(services, deps.logger));

  app.use(notFoundHandler);
  app.use(errorHandler(deps.logger));
  return app;
}
