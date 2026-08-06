/**
 * StorageProvider — the only thing the rest of the system knows about object
 * storage. Documents, the corpus and every route talk to this interface; none
 * of them can tell whether bytes live on local disk or in an S3 bucket. Swapping
 * backends, or later moving to pre-signed direct-to-storage uploads, is confined
 * to an implementation of this interface.
 *
 * Object keys are opaque and MUST carry no personal data: they are UUID-based
 * and never contain a filename. The real filename lives in the database only.
 */

export interface PutObject {
  /** Opaque, personal-data-free object key (see keyFor). */
  key: string;
  body: Buffer;
  contentType: string;
}

export interface GetObject {
  body: Buffer;
  contentType: string;
}

export interface StorageProvider {
  /** Store bytes under `key`, overwriting any object already there. */
  put(object: PutObject): Promise<void>;
  /** Fetch bytes, or null if the key does not exist. */
  get(key: string): Promise<GetObject | null>;
  /** Remove the object; succeeds silently if it is already gone. */
  delete(key: string): Promise<void>;
  /**
   * A short-lived URL a client could use to read the object directly. Today
   * every read is proxied through the API for audit, so this is unused for
   * serving — it exists for the planned pre-signed direct-to-storage flow.
   */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  /** True when an object exists under `key`. */
  exists(key: string): Promise<boolean>;
}

/**
 * Build an opaque object key. UUID-based, prefixed only by the (non-personal)
 * case id for coarse grouping in the bucket; never the filename, which would
 * leak a child's name into storage.
 */
export function keyFor(caseId: string, storageId: string): string {
  return `documents/${caseId}/${storageId}`;
}
