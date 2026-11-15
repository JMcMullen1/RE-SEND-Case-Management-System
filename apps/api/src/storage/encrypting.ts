import { decryptFile, encryptFile } from '../crypto/encryption';
import type { GetObject, PutObject, StorageProvider } from './provider';

/**
 * Wraps a storage backend so every file is encrypted before it is stored and
 * decrypted when it is read (see crypto/encryption.ts). Everything that reads
 * files — the content route, the corpus, the export — goes through this, so
 * none of it changes. Files stored before encryption read as they are.
 */
export class EncryptingProvider implements StorageProvider {
  constructor(private readonly inner: StorageProvider) {}

  put(object: PutObject): Promise<void> {
    return this.inner.put({ ...object, body: encryptFile(object.body) });
  }

  async get(key: string): Promise<GetObject | null> {
    const object = await this.inner.get(key);
    return object && { ...object, body: decryptFile(object.body) };
  }

  /** The stored (encrypted) bytes, for the start-up encryption pass. */
  getRaw(key: string): Promise<GetObject | null> {
    return this.inner.get(key);
  }

  /** Store bytes exactly as given (already encrypted), for the same pass. */
  putRaw(object: PutObject): Promise<void> {
    return this.inner.put(object);
  }

  delete(key: string): Promise<void> {
    return this.inner.delete(key);
  }

  /**
   * A direct URL would serve the encrypted bytes, which no browser can read:
   * every read goes through the API (and its audit) instead.
   */
  getSignedUrl(): Promise<string> {
    return Promise.reject(
      new Error('Stored files are encrypted: read them through the API.'),
    );
  }

  exists(key: string): Promise<boolean> {
    return this.inner.exists(key);
  }
}
