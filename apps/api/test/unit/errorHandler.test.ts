import { ApiErrorSchema } from '@approvals/contracts';
import express from 'express';
import request from 'supertest';
import { errorHandler, notFoundHandler } from '../../src/http/errorHandler';
import { openSse } from '../../src/http/sse';
import type { LogEntry } from '../../src/logging/logger';
import { bufferText, parseSse, typesOf } from '../fakes/sse';

function appWith(route: express.RequestHandler) {
  const logs: LogEntry[] = [];
  const app = express();
  app.get('/boom', route);
  app.use(notFoundHandler);
  app.use(errorHandler({ log: (entry) => logs.push(entry) }));
  return { app, logs };
}

describe('errorHandler', () => {
  it('turns an unexpected error into a generic 500 without leaking the message or stack', async () => {
    const { app, logs } = appWith(() => {
      throw new Error('db password is hunter2');
    });

    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(ApiErrorSchema.parse(res.body)).toEqual({
      error: { code: 'internal_error', message: 'Something went wrong. Please try again.' },
    });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(logs).toMatchObject([{ level: 'error', event: 'unhandled_error' }]); // details stay in server logs
  });

  it('handles async errors (Express 5 forwards rejected promises)', async () => {
    const { app } = appWith(async () => {
      await Promise.resolve();
      throw new Error('async failure');
    });

    expect((await request(app).get('/boom')).status).toBe(500);
  });

  it('ends an SSE stream with fallback and done when an error escapes after headers were sent', async () => {
    const { app } = appWith((req, res) => {
      const sse = openSse(req, res);
      sse.send({ type: 'token', text: 'Partial' });
      throw new Error('failed mid-stream');
    });

    const res = await bufferText(request(app).get('/boom'));

    expect(res.status).toBe(200);
    const events = parseSse(String(res.body));
    expect(typesOf(events)).toEqual(['token', 'fallback', 'done']);
    expect(events[1]).toMatchObject({ type: 'fallback', reason: 'llm_error' });
  });
});
