import {
  auditBackfill,
  auditEntriesWith,
  filesNotYetUnder,
  markFileKey,
  replaceAuditValues,
  replaceStoredValue,
  storedValues,
  withBackfillLock,
} from '../repositories/encryption-backfill';
import { getStorageProvider } from '../storage';
import {
  currentFileKeyId,
  decryptField,
  decryptFile,
  encryptField,
  encryptFile,
  fieldNeedsEncrypting,
  fileNeedsEncrypting,
} from './encryption';
import { ALL_SENSITIVE_FIELDS, SENSITIVE_COLUMNS } from './sensitive-fields';

export interface BackfillResult {
  /** Field values encrypted (or re-encrypted under a new key). */
  fields: number;
  /** Audit entries whose recorded sensitive values were encrypted. */
  auditEntries: number;
  /** Document files encrypted (or re-encrypted). */
  files: number;
  /** Values or files that could not be decrypted with the configured keys. */
  unreadable: number;
  /** Files that could not be read or written (storage errors). */
  failed: number;
}

/** A value made current: encrypted under the current key (null if no change needed). */
function upgradeField(value: string): string | null {
  return fieldNeedsEncrypting(value) ? encryptField(decryptField(value)) : null;
}

/**
 * Encrypt whatever is not yet encrypted under the current key: values, the
 * sensitive values audit entries recorded, and document files — stored before
 * encryption was switched on, or under the previous key after a rotation.
 * Idempotent and safe on every start; one instance at a time; a value edited
 * meanwhile is left for the next run; one failure never stops the rest. Files
 * already known to be under the current key are not read again.
 */
export async function runEncryptionBackfill(): Promise<BackfillResult | null> {
  const result: BackfillResult = {
    fields: 0,
    auditEntries: 0,
    files: 0,
    unreadable: 0,
    failed: 0,
  };
  const ran = await withBackfillLock(async () => {
    for (const [table, columns] of Object.entries(SENSITIVE_COLUMNS))
      for (const column of columns)
        for (const { id, value } of await storedValues(table, column)) {
          let now: string | null;
          try {
            now = upgradeField(value);
          } catch {
            result.unreadable += 1;
            continue;
          }
          if (now && (await replaceStoredValue(table, column, id, value, now)))
            result.fields += 1;
        }

    for (const entry of await auditEntriesWith(ALL_SENSITIVE_FIELDS)) {
      let changed = false;
      const upgrade = (side: unknown) => {
        if (!side || typeof side !== 'object' || Array.isArray(side))
          return side;
        const out = { ...(side as Record<string, unknown>) };
        for (const field of ALL_SENSITIVE_FIELDS) {
          const value = out[field];
          if (typeof value !== 'string' || value === '') continue;
          try {
            const now = upgradeField(value);
            if (now) {
              out[field] = now;
              changed = true;
            }
          } catch {
            result.unreadable += 1;
          }
        }
        return out;
      };
      const now = {
        before: upgrade(entry.before),
        after: upgrade(entry.after),
      };
      if (changed && (await replaceAuditValues(entry.id, entry, now)))
        result.auditEntries += 1;
    }

    const storage = getStorageProvider();
    const keyId = currentFileKeyId();
    for (const key of await filesNotYetUnder(keyId)) {
      try {
        const stored = await storage.getRaw(key);
        if (!stored) continue;
        let needs: boolean;
        try {
          needs = fileNeedsEncrypting(stored.body);
        } catch {
          result.unreadable += 1;
          continue;
        }
        if (needs) {
          await storage.putRaw({
            key,
            contentType: stored.contentType,
            body: encryptFile(decryptFile(stored.body)),
          });
          result.files += 1;
        }
        await markFileKey(key, keyId);
      } catch {
        result.failed += 1;
      }
    }
    if (Object.values(result).some((n) => n > 0))
      await auditBackfill({ ...result });
  });
  return ran ? result : null;
}
