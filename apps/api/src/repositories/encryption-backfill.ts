import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { recordAudit } from './audit';

/**
 * Database side of the start-up encryption pass (crypto/backfill.ts). Table
 * and column names come only from SENSITIVE_COLUMNS, never from input.
 */

const ident = (name: string) => sql.raw(`"${name.replace(/"/g, '""')}"`);

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
 * (so an edit made meanwhile is never overwritten). Leaves updated_at alone:
 * the record's content has not changed.
 */
export async function replaceStoredValue(
  table: string,
  column: string,
  id: string,
  was: string,
  now: string,
): Promise<boolean> {
  const rows = (await getDb().execute(
    sql`UPDATE ${ident(table)} SET ${ident(column)} = ${now}
        WHERE id = ${id} AND ${ident(column)} = ${was} RETURNING id`,
  )) as unknown as { id: string }[];
  return rows.length > 0;
}

/** The storage key of every document ever stored (deleted ones included). */
export async function storedFileKeys(): Promise<string[]> {
  const rows = (await getDb().execute(
    sql`SELECT DISTINCT storage_key FROM documents`,
  )) as unknown as { storage_key: string }[];
  return rows.map((r) => r.storage_key);
}

/**
 * Run `work` only if no other instance is running it (true if it ran). The
 * lock is held by an open transaction, so it belongs to one connection and is
 * always released when the work ends (a session lock taken and released
 * through a pool can land on different connections and never be released).
 */
export async function withBackfillLock(
  work: () => Promise<void>,
): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const [got] = (await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(hashtext('encryption_backfill')) AS ok`,
    )) as unknown as { ok: boolean }[];
    if (!got?.ok) return false;
    await work();
    return true;
  });
}

/** Audit what the pass changed (counts only). */
export async function auditBackfill(counts: {
  fields: number;
  files: number;
}): Promise<void> {
  await recordAudit(getDb(), {
    actorUserId: null,
    action: 'encryption.backfill',
    entityType: 'system',
    entityId: randomUUID(),
    after: counts,
  });
}
