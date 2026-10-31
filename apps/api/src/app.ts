import express, { type Express } from 'express';

// App factory: dependencies (LLM client, config) get injected here in later phases,
// so Supertest can build an app with fakes and no network.
export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  return app;
}
