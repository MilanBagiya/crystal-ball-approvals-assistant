import request from 'supertest';
import { createApp } from '../src/app';

describe('api scaffold', () => {
  it('builds an Express app that Supertest can call', async () => {
    const res = await request(createApp()).get('/does-not-exist');
    expect(res.status).toBe(404);
  });
});
