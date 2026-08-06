import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { GetObject, PutObject, StorageProvider } from './provider';

/**
 * LocalDiskProvider — bytes on the local filesystem under a root directory.
 * The store for now; used in development and tests. Content types are held in a
 * sidecar `.meta` file so get() can return the same content type it was given,
 * without the database having to be consulted.
 */
export class LocalDiskProvider implements StorageProvider {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = resolve(rootDir);
  }

  private pathFor(key: string): string {
    // Keys are our own UUID-based strings, but treat them as untrusted: a key
    // must never escape the storage root.
    const full = resolve(join(this.root, key));
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new Error('Invalid storage key');
    }
    return full;
  }

  async put(object: PutObject): Promise<void> {
    const path = this.pathFor(object.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, object.body);
    await writeFile(`${path}.meta`, object.contentType, 'utf8');
  }

  async get(key: string): Promise<GetObject | null> {
    const path = this.pathFor(key);
    try {
      const body = await readFile(path);
      const contentType = await readFile(`${path}.meta`, 'utf8').catch(
        () => 'application/octet-stream',
      );
      return { body, contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.pathFor(key);
    await rm(path, { force: true });
    await rm(`${path}.meta`, { force: true });
  }

  async getSignedUrl(key: string): Promise<string> {
    // No signing on local disk: the API is the only reader. Reads are proxied
    // through the audited content route, never handed to the browser directly.
    return `/api/documents/by-key/${encodeURIComponent(key)}`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }
}
