import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDb, reserveConnection } from '../db/client';
import { recordAudit } from './audit';

/**
 * Database side of the start-up encryption pass (crypto/backfill.ts). Table
 * and column names come only from SENSITIVE_COLUMNS, never from input. Every
 * write here only re-stores a value in another form, so it runs with
 * resend.keep_updated_at set: records keep their "last updated" time.
 */

const ident = (name: string) => sql.raw(`"${name.replace(/"/g, '""')}"`);

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

/** Run a storage-only change: updated_at is left as it was. */
function restore<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL resend.keep_updated_at = 'on'`);
    return work(tx);
  });
}

/** Every stored value of one sensitive column (to check which need it). */
export async function storedValues(
  table: string,
  column: string,
): Promise<{ id: string; value: string }[]> {
  return (await getDb().execute(
    sql`SELECT id, ${ident(column)} AS value FROM ${ident(table)}
        WHERE ${ident(column)} IS NOT NULL AND ${ident(column)} <> ''`,
  )) as unknown as { id: string; value: string }[];
}

/**
 * Replace a value with its encrypted form, only if it is still the value read
 * (so an edit made meanwhile is never overwritten).
 */
export async function replaceStoredValue(
  table: string,
  column: string,
  id: string,
  was: string,
  now: string,
): Promise<boolean> {
  return restore(async (tx) => {
    const rows = (await tx.execute(
      sql`UPDATE ${ident(table)} SET ${ident(column)} = ${now}
          WHERE id = ${id} AND ${ident(column)} = ${was} RETURNING id`,
    )) as unknown as { id: string }[];
    return rows.length > 0;
  });
}

/** Audit entries that recorded any of the given fields (edits of them). */
export async function auditEntriesWith(
  fields: readonly string[],
): Promise<{ id: string; before: unknown; after: unknown }[]> {
  const keys = sql`ARRAY[${sql.join(
    fields.map((f) => sql`${f}`),
    sql`, `,
  )}]::text[]`;
  return (await getDb().execute(
    sql`SELECT id, before, after FROM audit_log
        WHERE (jsonb_typeof(before) = 'object' AND before ?| ${keys})
           OR (jsonb_typeof(after) = 'object' AND after ?| ${keys})`,
  )) as unknown as { id: string; before: unknown; after: unknown }[];
}

/** Replace an audit entry's before/after, only if unchanged since read. */
export async function replaceAuditValues(
  id: string,
  was: { before: unknown; after: unknown },
  now: { before: unknown; after: unknown },
): Promise<boolean> {
  return restore(async (tx) => {
    const rows = (await tx.execute(
      sql`UPDATE audit_log
          SET before = ${JSON.stringify(now.before)}::jsonb,
              after = ${JSON.stringify(now.after)}::jsonb
          WHERE id = ${id}
            AND before IS NOT DISTINCT FROM ${JSON.stringify(was.before)}::jsonb
            AND after IS NOT DISTINCT FROM ${JSON.stringify(was.after)}::jsonb
          RETURNING id`,
    )) as unknown as { id: string }[];
    return rows.length > 0;
  });
}

/**
 * Storage keys of documents (deleted ones included) not yet known to be
 * encrypted under the current file key.
 */
export async function filesNotYetUnder(keyId: string): Promise<string[]> {
  const rows = (await getDb().execute(
    sql`SELECT DISTINCT storage_key FROM documents
        WHERE encryption_key_id IS DISTINCT FROM ${keyId}`,
  )) as unknown as { storage_key: string }[];
  return rows.map((r) => r.storage_key);
}

/** Record that a stored file is encrypted under the given file key. */
export async function markFileKey(
  storageKey: string,
  keyId: string,
): Promise<void> {
  await restore((tx) =>
    tx.execute(
      sql`UPDATE documents SET encryption_key_id = ${keyId}
          WHERE storage_key = ${storageKey}`,
    ),
  );
}

/**
 * Run `work` only if no other instance is running it (true if it ran). A
 * session lock on a connection of its own: held exactly as long as the work,
 * always released, and no transaction left open meanwhile.
 */
export async function withBackfillLock(
  work: () => Promise<void>,
): Promise<boolean> {
  const conn = await reserveConnection();
  try {
    const [got] =
      await conn`SELECT pg_try_advisory_lock(hashtext('encryption_backfill')) AS ok`;
    if (!got?.ok) return false;
    try {
      await work();
    } finally {
      await conn`SELECT pg_advisory_unlock(hashtext('encryption_backfill'))`;
    }
    return true;
  } finally {
    conn.release();
  }
}

/** Audit what the pass did (counts only). */
export async function auditBackfill(
  counts: Record<string, number>,
): Promise<void> {
  await recordAudit(getDb(), {
    actorUserId: null,
    action: 'encryption.backfill',
    entityType: 'system',
    entityId: randomUUID(),
    after: counts,
  });
}
