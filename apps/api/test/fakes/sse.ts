import { StreamEventSchema, type StreamEvent } from '@approvals/contracts';
import type { Express } from 'express';
import request from 'supertest';

// Parses an SSE body into events, validating each one against the shared contract.
export function parseSse(body: string): StreamEvent[] {
  return body
    .split('\n\n')
    .map((frame) => frame.trim())
    .filter(Boolean)
    .map((frame) => {
      if (!frame.startsWith('data: ')) throw new Error(`Unexpected SSE frame: ${frame}`);
      return StreamEventSchema.parse(JSON.parse(frame.slice('data: '.length)));
    });
}

// Buffers the raw body as text whatever the content type (superagent doesn't buffer event streams by default).
export function bufferText(test: request.Test): request.Test {
  return test.buffer(true).parse((response, callback) => {
    let text = '';
    response.setEncoding('utf8');
    response.on('data', (chunk: string) => (text += chunk));
    response.on('end', () => callback(null, text));
  });
}

export async function postSse(app: Express, path: string, body: object, headers: Record<string, string> = {}) {
  const res = await bufferText(request(app).post(path).set(headers).send(body));
  const text = typeof res.body === 'string' ? res.body : '';
  const isStream = String(res.headers['content-type']).startsWith('text/event-stream');
  return { res, events: isStream ? parseSse(text) : [], json: isStream ? undefined : (JSON.parse(text) as unknown) };
}

export const typesOf = (events: StreamEvent[]) => events.map((e) => e.type);
