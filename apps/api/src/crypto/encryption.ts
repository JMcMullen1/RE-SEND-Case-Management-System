import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { env } from '../env';

/**
 * Encryption of sensitive fields and of stored document files, on top of the
 * database's and the disk's own encryption at rest: someone with a copy of the
 * database or the file store, but not the key, cannot read these.
 *
 * AES-256-GCM (authenticated: a tampered value fails to decrypt rather than
 * reading as something else), a fresh random nonce for every value, and keys
 * derived from ENCRYPTION_KEY with HKDF — separate keys for fields and files.
 * ENCRYPTION_KEY_PREVIOUS, if set, is tried when decrypting, so the key can be
 * rotated: set the new key, keep the old one as previous, and the start-up
 * pass re-encrypts everything under the new key.
 *
 * Values written before encryption was switched on (plain text, or a file
 * without the header) are read as they are, and the start-up pass encrypts
 * them, so turning this on needs no downtime.
 */

/** A field value that is encrypted starts with this. */
export const FIELD_PREFIX = 'enc:v1:';
/** A stored file that is encrypted starts with these bytes. */
const FILE_MAGIC = Buffer.from('RSENC1\0', 'latin1');
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** Used only when NODE_ENV=test and no key is set: never a real key. */
const TEST_ONLY_KEY = 'test-only-encryption-key-never-used-for-real-data';

export class EncryptionKeyMissing extends Error {}
export class DecryptionFailed extends Error {}

function keyMaterial(): { current: string; previous: string | null } {
  const current =
    env.ENCRYPTION_KEY ||
    (env.NODE_ENV === 'test' || process.env.VITEST ? TEST_ONLY_KEY : null);
  if (!current)
    throw new EncryptionKeyMissing(
      'ENCRYPTION_KEY is not set. Sensitive fields and documents cannot be stored without it.',
    );
  return { current, previous: env.ENCRYPTION_KEY_PREVIOUS || null };
}

const derived = new Map<string, Buffer>();
function derive(material: string, purpose: 'fields' | 'files'): Buffer {
  const id = `${purpose}\u0000${material}`;
  let key = derived.get(id);
  if (!key) {
    key = Buffer.from(
      hkdfSync('sha256', material, 're-send', `re-send ${purpose} v1`, 32),
    );
    derived.set(id, key);
  }
  return key;
}

function keys(purpose: 'fields' | 'files'): Buffer[] {
  const { current, previous } = keyMaterial();
  return [
    derive(current, purpose),
    ...(previous ? [derive(previous, purpose)] : []),
  ];
}

function seal(plain: Buffer, key: Buffer): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([nonce, body, cipher.getAuthTag()]);
}

/** Open a sealed value with the first key that fits; which key, by index. */
function open(
  sealed: Buffer,
  candidates: Buffer[],
): { plain: Buffer; keyIndex: number } {
  const nonce = sealed.subarray(0, NONCE_BYTES);
  const tag = sealed.subarray(sealed.length - TAG_BYTES);
  const body = sealed.subarray(NONCE_BYTES, sealed.length - TAG_BYTES);
  for (const [keyIndex, key] of candidates.entries()) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAuthTag(tag);
      return {
        plain: Buffer.concat([decipher.update(body), decipher.final()]),
        keyIndex,
      };
    } catch {
      /* try the next key */
    }
  }
  throw new DecryptionFailed(
    'A protected value could not be decrypted with the configured key.',
  );
}

// --- Fields ------------------------------------------------------------------

export function isEncryptedField(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(FIELD_PREFIX);
}

/**
 * Encrypt a plain-text field for storage (null and empty stay as they are).
 * Always encrypts — even text that happens to look encrypted — so nothing a
 * person types can be stored unprotected.
 */
export function encryptField<T extends string | null | undefined>(value: T): T {
  if (value === null || value === undefined || value === '') return value;
  const [key] = keys('fields');
  return `${FIELD_PREFIX}${seal(Buffer.from(value, 'utf8'), key!).toString('base64')}` as T;
}

/** Read a stored field: decrypted, or as it is if it was never encrypted. */
export function decryptField<T extends string | null | undefined>(value: T): T {
  if (!isEncryptedField(value)) return value;
  const sealed = Buffer.from(value!.slice(FIELD_PREFIX.length), 'base64');
  return open(sealed, keys('fields')).plain.toString('utf8') as T;
}

/** Whether a stored field should be (re-)encrypted under the current key. */
export function fieldNeedsEncrypting(value: string | null): boolean {
  if (value === null || value === '') return false;
  if (!isEncryptedField(value)) return true;
  const sealed = Buffer.from(value.slice(FIELD_PREFIX.length), 'base64');
  return open(sealed, keys('fields')).keyIndex > 0;
}

// --- Files -------------------------------------------------------------------

export function isEncryptedFile(bytes: Buffer): boolean {
  return (
    bytes.length >= FILE_MAGIC.length &&
    bytes.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC)
  );
}

/** Encrypt a file's plain bytes for storage (always, whatever they start with). */
export function encryptFile(bytes: Buffer): Buffer {
  const [key] = keys('files');
  return Buffer.concat([FILE_MAGIC, seal(bytes, key!)]);
}

/** A stored file's bytes: decrypted, or as they are if never encrypted. */
export function decryptFile(bytes: Buffer): Buffer {
  if (!isEncryptedFile(bytes)) return bytes;
  return open(bytes.subarray(FILE_MAGIC.length), keys('files')).plain;
}

/** Whether a stored file should be (re-)encrypted under the current key. */
export function fileNeedsEncrypting(bytes: Buffer): boolean {
  if (!isEncryptedFile(bytes)) return true;
  return open(bytes.subarray(FILE_MAGIC.length), keys('files')).keyIndex > 0;
}

/** Fail at start-up, not at the first save, when no key is configured. */
export function assertEncryptionConfigured(): void {
  keyMaterial();
}

/** Test seam: forget derived keys after changing the environment. */
export function resetEncryptionKeys(): void {
  derived.clear();
}
