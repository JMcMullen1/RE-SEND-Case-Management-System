import { describe, expect, it } from 'vitest';
import { buildServer } from './server';

describe('server', () => {
  it('serves a validated health check', async () => {
    const app = await buildServer();
    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'RE-SEND' });
    await app.close();
  });
});
