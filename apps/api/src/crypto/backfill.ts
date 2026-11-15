import {
  auditBackfill,
  replaceStoredValue,
  storedFileKeys,
  storedValues,
  withBackfillLock,
} from '../repositories/encryption-backfill';
import { getStorageProvider } from '../storage';
import {
  decryptField,
  decryptFile,
  encryptField,
  encryptFile,
  fieldNeedsEncrypting,
  fileNeedsEncrypting,
} from './encryption';
import { SENSITIVE_COLUMNS } from './sensitive-fields';

export interface BackfillResult {
  fields: number;
  files: number;
  /** Values or files that could not be read with the configured keys. */
  unreadable: number;
}

/**
 * Encrypt whatever is not yet encrypted under the current key: values and
 * files stored before encryption was switched on, or under the previous key
 * after a rotation. Idempotent and safe to run on every start; one instance
 * at a time. A value edited meanwhile is left for the next run. Nothing is
 * logged but counts.
 */
export async function runEncryptionBackfill(): Promise<BackfillResult | null> {
  const result: BackfillResult = { fields: 0, files: 0, unreadable: 0 };
  const ran = await withBackfillLock(async () => {
    for (const [table, columns] of Object.entries(SENSITIVE_COLUMNS))
      for (const column of columns)
        for (const { id, value } of await storedValues(table, column)) {
          let needs: boolean;
          try {
            needs = fieldNeedsEncrypting(value);
          } catch {
            result.unreadable += 1;
            continue;
          }
          if (!needs) continue;
          const now = encryptField(decryptField(value));
          if (await replaceStoredValue(table, column, id, value, now))
            result.fields += 1;
        }

    const storage = getStorageProvider();
    for (const key of await storedFileKeys()) {
      const stored = await storage.getRaw(key);
      if (!stored) continue;
      let needs: boolean;
      try {
        needs = fileNeedsEncrypting(stored.body);
      } catch {
        result.unreadable += 1;
        continue;
      }
      if (!needs) continue;
      await storage.putRaw({
        key,
        contentType: stored.contentType,
        body: encryptFile(decryptFile(stored.body)),
      });
      result.files += 1;
    }
    if (result.fields || result.files) await auditBackfill(result);
  });
  return ran ? result : null;
}
