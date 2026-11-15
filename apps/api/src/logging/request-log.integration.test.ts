import { describe, expect, it, vi } from 'vitest';
import { buildServer } from '../server';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('request logging', () => {
  it('never logs a query string (it can carry what someone searched for)', async () => {
    const lines: string[] = [];
    const spy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        lines.push(String(chunk));
        return true;
      });
    try {
      const app = await buildServer();
      await app.inject({
        method: 'GET',
        url: '/api/cases/00000000-0000-0000-0000-000000000000/timeline?q=Zebedee%20Madeupname',
      });
      await app.close();
    } finally {
      spy.mockRestore();
    }
    const requestLines = lines.filter((l) => l.includes('/timeline'));
    expect(requestLines.length).toBeGreaterThan(0);
    expect(lines.join('')).not.toContain('Madeupname');
  });
});
