import type { ApprovalItem } from '@approvals/contracts';
import cors from 'cors';
import express, { type Express } from 'express';
import type { AppConfig } from './config/config';
import { createApprovalQueue } from './domain/approvalQueue';
import type { PolicyChunk } from './domain/policyChunks';
import { errorHandler, notFoundHandler } from './http/errorHandler';
import { aiRateLimiters } from './http/rateLimit';
import type { LlmClient } from './llm/LlmClient';
import { createLlmRunner } from './llm/llmRunner';
import type { UsageLogger } from './llm/usageLog';
import type { Logger } from './logging/logger';
import { aiRoutes, type AiServices } from './routes/ai';
import { approvalRoutes } from './routes/approvals';
import { systemRoutes } from './routes/system';
import { createChatService } from './services/chatService';
import { createCommentService } from './services/commentService';
import { createGreetingService } from './services/greetingService';
import { createHelpService } from './services/helpService';
import { createReviewService } from './services/reviewService';
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

  // The queue lives in memory for the life of the process; decisions update it (a restart resets the demo).
  const queue = createApprovalQueue(deps.approvals);
  const listApprovals = () => queue.list();

  const runner = createLlmRunner({ llm: deps.llm, timeoutMs: deps.config.llmTimeoutMs, logUsage: deps.logUsage });
  const services: AiServices = {
    greeting: createGreetingService({ runner, listApprovals, logger: deps.logger }),
    summary: createSummaryService({ runner, listApprovals, logger: deps.logger }),
    help: createHelpService({ runner, policyChunks: deps.policyChunks }),
    chat: createChatService({ runner, listApprovals, policyChunks: deps.policyChunks }),
    review: createReviewService({ runner, policyChunks: deps.policyChunks }),
    comment: createCommentService({ runner, policyChunks: deps.policyChunks }),
  };

  app.use('/api', systemRoutes({ llm: deps.llm }));
  app.use('/api/approvals', approvalRoutes(queue));
  // Rate limiting runs first, so over-limit requests never reach validation or the LLM.
  app.use('/api/ai', ...aiRateLimiters(deps.config.rateLimitPerMin), aiRoutes(services, deps.logger, queue));

  app.use(notFoundHandler);
  app.use(errorHandler(deps.logger));
  return app;
}
