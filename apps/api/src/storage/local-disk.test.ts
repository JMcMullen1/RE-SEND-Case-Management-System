import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalDiskProvider } from './local-disk';

describe('LocalDiskProvider', () => {
  let root: string;
  let provider: LocalDiskProvider;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'resend-storage-'));
    provider = new LocalDiskProvider(root);
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('round-trips bytes and content type', async () => {
    const key = 'documents/case-1/obj-1';
    await provider.put({
      key,
      body: Buffer.from('hello'),
      contentType: 'text/plain',
    });
    expect(await provider.exists(key)).toBe(true);
    const got = await provider.get(key);
    expect(got?.body.toString()).toBe('hello');
    expect(got?.contentType).toBe('text/plain');
  });

  it('returns null and false for missing keys', async () => {
    expect(await provider.get('documents/nope')).toBeNull();
    expect(await provider.exists('documents/nope')).toBe(false);
  });

  it('deletes idempotently', async () => {
    const key = 'documents/case-1/obj-2';
    await provider.put({
      key,
      body: Buffer.from('x'),
      contentType: 'application/octet-stream',
    });
    await provider.delete(key);
    await provider.delete(key); // no throw the second time
    expect(await provider.exists(key)).toBe(false);
  });

  it('refuses keys that escape the storage root', async () => {
    await expect(provider.get('../../../etc/passwd')).rejects.toThrow(
      /Invalid storage key/,
    );
  });
});
