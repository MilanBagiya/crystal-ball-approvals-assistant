import { ApiErrorSchema } from '@approvals/contracts';
import request from 'supertest';
import { buildTestApp } from '../fakes/testApp';

// Every AI endpoint rejects a bad body with 400 in the ApiError shape, before any LLM call is made.

const cases: [string, string, object, RegExp][] = [
  ['greeting with a non-HH:MM localTime', '/api/ai/greeting', { localTime: '2pm' }, /localTime/],
  ['summary with a non-string language', '/api/ai/summary', { language: 42 }, /language/],
];

describe('request validation', () => {
  it.each(cases)('rejects %s', async (_label, path, body, field) => {
    const { app, usage } = buildTestApp();

    const res = await request(app).post(path).send(body);

    expect(res.status).toBe(400);
    const { error } = ApiErrorSchema.parse(res.body);
    expect(error.code).toBe('invalid_request');
    expect(error.message).toMatch(field);
    expect(usage).toHaveLength(0); // no LLM call for an invalid request
  });
});
