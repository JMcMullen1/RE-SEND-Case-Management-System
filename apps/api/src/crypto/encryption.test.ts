import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../env';
import {
  DecryptionFailed,
  EncryptionKeyMissing,
  FIELD_PREFIX,
  assertEncryptionConfigured,
  decryptField,
  decryptFile,
  encryptField,
  encryptFile,
  fieldNeedsEncrypting,
  fileNeedsEncrypting,
  isEncryptedFile,
  readField,
  resetEncryptionKeys,
  UNREADABLE_FIELD,
} from './encryption';

const mutable = env as { -readonly [K in keyof typeof env]: (typeof env)[K] };
const KEY_A = 'a'.repeat(32) + '-first-test-key';
const KEY_B = 'b'.repeat(32) + '-second-test-key';
const original = {
  key: env.ENCRYPTION_KEY,
  previous: env.ENCRYPTION_KEY_PREVIOUS,
  nodeEnv: env.NODE_ENV,
  vitest: process.env.VITEST,
};
function useKeys(current: string | undefined, previous?: string) {
  mutable.ENCRYPTION_KEY = current;
  mutable.ENCRYPTION_KEY_PREVIOUS = previous;
  resetEncryptionKeys();
}
afterEach(() => {
  mutable.ENCRYPTION_KEY = original.key;
  mutable.ENCRYPTION_KEY_PREVIOUS = original.previous;
  mutable.NODE_ENV = original.nodeEnv;
  process.env.VITEST = original.vitest;
  resetEncryptionKeys();
});

describe('field encryption', () => {
  it('round-trips, never stores the text, and differs every time', () => {
    useKeys(KEY_A);
    const a = encryptField('Autism; speech and language needs');
    const b = encryptField('Autism; speech and language needs');
    expect(a.startsWith(FIELD_PREFIX)).toBe(true);
    expect(a).not.toContain('speech');
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe('Autism; speech and language needs');
    expect(encryptField(null)).toBeNull();
    expect(encryptField('')).toBe('');
  });

  it('reads values stored before encryption as they are', () => {
    useKeys(KEY_A);
    expect(decryptField('Plain needs text')).toBe('Plain needs text');
    expect(fieldNeedsEncrypting('Plain needs text')).toBe(true);
    expect(fieldNeedsEncrypting(encryptField('x'))).toBe(false);
  });

  it('encrypts text that only looks encrypted, so nothing typed is stored bare', () => {
    useKeys(KEY_A);
    const typed = `${FIELD_PREFIX}not really encrypted`;
    expect(decryptField(encryptField(typed))).toBe(typed);
  });

  it('refuses a tampered value, or the wrong key, rather than misreading it', () => {
    useKeys(KEY_A);
    const stored = encryptField('Sensitive');
    const flipped = Buffer.from(stored.slice(FIELD_PREFIX.length), 'base64');
    flipped[20] = flipped[20]! ^ 1;
    expect(() =>
      decryptField(FIELD_PREFIX + flipped.toString('base64')),
    ).toThrow(DecryptionFailed);
    useKeys(KEY_B);
    expect(() => decryptField(stored)).toThrow(DecryptionFailed);
  });

  it('rotates: the previous key still reads, and those values need re-encrypting', () => {
    useKeys(KEY_A);
    const old = encryptField('Before rotation');
    useKeys(KEY_B, KEY_A);
    expect(decryptField(old)).toBe('Before rotation');
    expect(fieldNeedsEncrypting(old)).toBe(true);
    expect(fieldNeedsEncrypting(encryptField('After rotation'))).toBe(false);
  });
});

describe('file encryption', () => {
  it('round-trips, hides the content and reads older plain files', () => {
    useKeys(KEY_A);
    const plain = Buffer.from('%PDF-1.7 EHC plan for a made-up child');
    const stored = encryptFile(plain);
    expect(isEncryptedFile(stored)).toBe(true);
    expect(stored.includes(Buffer.from('EHC plan'))).toBe(false);
    expect(decryptFile(stored).equals(plain)).toBe(true);
    expect(decryptFile(plain).equals(plain)).toBe(true);
    expect(fileNeedsEncrypting(plain)).toBe(true);
    expect(fileNeedsEncrypting(stored)).toBe(false);
  });

  it('encrypts a file that starts like an encrypted one', () => {
    useKeys(KEY_A);
    const crafted = Buffer.concat([
      Buffer.from('RSENC1\0', 'latin1'),
      Buffer.from('x'),
    ]);
    expect(decryptFile(encryptFile(crafted)).equals(crafted)).toBe(true);
  });
});

describe('without a key', () => {
  it('refuses to start outside tests', () => {
    useKeys(undefined);
    mutable.NODE_ENV = 'development';
    delete process.env.VITEST;
    expect(() => assertEncryptionConfigured()).toThrow(EncryptionKeyMissing);
  });
});

describe('reading for display', () => {
  it('shows a marker for a value it cannot decrypt, instead of failing', () => {
    useKeys(KEY_A);
    const stored = encryptField('Sensitive');
    useKeys(KEY_B);
    let told = false;
    expect(readField(stored, () => (told = true))).toBe(UNREADABLE_FIELD);
    expect(told).toBe(true);
  });
});

describe('the test-only key', () => {
  it('is never used in production, even under a test runner', () => {
    useKeys(undefined);
    mutable.NODE_ENV = 'production';
    expect(() => assertEncryptionConfigured()).toThrow(EncryptionKeyMissing);
  });
});
