import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import {
  UNREADABLE_FIELD,
  currentFileKeyId,
  encryptField,
  isEncryptedField,
  readField,
} from '../crypto/encryption';
import {
  ALL_SENSITIVE_FIELDS,
  SENSITIVE_COLUMNS,
} from '../crypto/sensitive-fields';
import { EXPORT_TABLES } from './export';
import { recordAudit } from './audit';

/**
 * Backups and restore: the database side. A full export carries, besides its
 * readable CSVs, every table as JSON lines (exact values, sensitive fields
 * decrypted so the backup opens under any key) and a manifest. Restoring puts
 * every row back, with its own id, in one transaction.
 */

/** Which migrations the database has run: a backup restores into the same. */
export async function migrationState(): Promise<{
  count: number;
  lastHash: string | null;
}> {
  const [row] = (await getDb().execute(
    sql`SELECT count(*)::int AS count,
               (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC, id DESC LIMIT 1) AS last_hash
        FROM drizzle.__drizzle_migrations`,
  )) as unknown as { count: number; last_hash: string | null }[];
  return { count: row?.count ?? 0, lastHash: row?.last_hash ?? null };
}

export interface ForeignKey {
  table: string;
  column: string;
  references: string;
}

/** The links between the exported tables, from the database's catalogue. */
export async function foreignKeys(): Promise<ForeignKey[]> {
  const rows = (await getDb().execute(
    sql`SELECT tc.table_name AS table, kcu.column_name AS column,
               ccu.table_name AS references
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name
         AND kcu.table_schema = tc.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
  )) as unknown as ForeignKey[];
  const exported = new Set(EXPORT_TABLES.map((t) => t.table));
  return rows.filter(
    (r) => exported.has(r.table) && exported.has(r.references),
  );
}

/**
 * The order to put tables back in — every table after the ones it refers to
 * — and, for each table, the columns that must be filled in afterwards (a
 * table referring to itself, or to one not yet restored).
 */
export function restorePlan(
  tables: readonly string[],
  keys: readonly ForeignKey[],
): { order: string[]; deferred: Record<string, string[]> } {
  const order: string[] = [];
  const placed = new Set<string>();
  const visiting = new Set<string>();
  const visit = (table: string) => {
    if (placed.has(table) || visiting.has(table)) return;
    visiting.add(table);
    for (const k of keys)
      if (k.table === table && k.references !== table) visit(k.references);
    visiting.delete(table);
    placed.add(table);
    order.push(table);
  };
  for (const t of tables) visit(t);
  const deferred: Record<string, string[]> = {};
  const done = new Set<string>();
  for (const table of order) {
    for (const k of keys)
      if (
        k.table === table &&
        (k.references === table || !done.has(k.references))
      ) {
        const list = (deferred[table] ??= []);
        if (!list.includes(k.column)) list.push(k.column);
      }
    done.add(table);
  }
  return { order, deferred };
}

/**
 * One page of a table's rows for the backup, exactly as Postgres holds them
 * (row_to_json: dates as dates, lists as lists, JSON as JSON), with sensitive
 * values decrypted — readable, and restorable under any key. A value that
 * cannot be decrypted is written as the marker the screens show.
 */
export async function backupTablePage(
  table: string,
  columns: string[],
  offset: number,
  limit: number,
): Promise<Record<string, unknown>[]> {
  if (!EXPORT_TABLES.some((t) => t.table === table))
    throw new Error(`Table ${table} is not exportable`);
  const list = columns.map(ident).join(', ');
  const rows = (await getDb().execute(
    sql.raw(
      `SELECT row_to_json(r) AS row FROM (SELECT ${list} FROM ${ident(table)} ORDER BY 1 LIMIT ${Math.trunc(limit)} OFFSET ${Math.trunc(offset)}) r`,
    ),
  )) as unknown as { row: Record<string, unknown> }[];
  const sensitive =
    SENSITIVE_COLUMNS[table as keyof typeof SENSITIVE_COLUMNS] ?? [];
  return rows.map(({ row }) => {
    const out = { ...row };
    for (const column of sensitive)
      out[column] = readField(out[column] as string | null);
    if (table === 'audit_log')
      for (const column of ['before', 'after']) {
        const v = out[column];
        if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
        const copy = { ...(v as Record<string, unknown>) };
        for (const field of ALL_SENSITIVE_FIELDS)
          if (typeof copy[field] === 'string')
            copy[field] = readField(copy[field] as string);
        out[column] = copy;
      }
    return out;
  });
}

/** A restored row made safe to store: sensitive values encrypted again. */
function protect(table: string, row: Record<string, unknown>) {
  const out = { ...row };
  const sensitive =
    SENSITIVE_COLUMNS[table as keyof typeof SENSITIVE_COLUMNS] ?? [];
  for (const column of sensitive) {
    const v = out[column];
    if (typeof v === 'string' && v !== UNREADABLE_FIELD && !isEncryptedField(v))
      out[column] = encryptField(v);
  }
  if (table === 'audit_log')
    for (const column of ['before', 'after']) {
      const v = out[column];
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      const copy = { ...(v as Record<string, unknown>) };
      for (const field of ALL_SENSITIVE_FIELDS)
        if (
          typeof copy[field] === 'string' &&
          !isEncryptedField(copy[field] as string)
        )
          copy[field] = encryptField(copy[field] as string);
      out[column] = copy;
    }
  return out;
}

async function* rowsOf(
  file: string,
  batch: number,
): AsyncGenerator<Record<string, unknown>[]> {
  const lines = createInterface({ input: createReadStream(file, 'utf8') });
  let rows: Record<string, unknown>[] = [];
  for await (const line of lines) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as Record<string, unknown>);
    if (rows.length >= batch) {
      yield rows;
      rows = [];
    }
  }
  if (rows.length) yield rows;
}

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;
const BATCH = 500;

export interface RestoreTable {
  table: string;
  columns: string[];
  /** JSON lines, one row each. */
  file: string;
}

/**
 * Replace everything with the backup's rows, in one transaction: every
 * exported table emptied, then refilled in dependency order with the backup's
 * own ids (links that point forward or to the same table filled in after).
 * Sensitive values are encrypted under the current key. Afterwards the
 * restore is audited — by the admin, if their account is in the backup.
 */
export async function restoreTables(
  tables: RestoreTable[],
  actor: string,
  summary: Record<string, unknown>,
): Promise<{ rows: number }> {
  const db = getDb();
  const keys = await foreignKeys();
  const byName = new Map(tables.map((t) => [t.table, t]));
  const { order, deferred } = restorePlan(
    tables.map((t) => t.table),
    keys,
  );
  let total = 0;
  await db.transaction(async (tx) => {
    // One restore at a time, and nothing else writing meanwhile: TRUNCATE
    // holds every table until the transaction ends.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('re-send:restore'))`,
    );
    // Rows keep the updated_at they had.
    await tx.execute(sql`SET LOCAL resend.keep_updated_at = 'on'`);
    await tx.execute(
      sql.raw(
        `TRUNCATE ${EXPORT_TABLES.map((t) => ident(t.table)).join(', ')}`,
      ),
    );
    for (const name of order) {
      const t = byName.get(name)!;
      const later = new Set(deferred[name] ?? []);
      const cols = t.columns.map(ident).join(', ');
      for await (const rows of rowsOf(t.file, BATCH)) {
        const json = JSON.stringify(
          rows.map((r) => {
            const row = protect(name, r);
            for (const c of later) row[c] = null;
            return row;
          }),
        );
        await tx.execute(
          sql`${sql.raw(`INSERT INTO ${ident(name)} (${cols}) SELECT ${cols} FROM jsonb_populate_recordset(NULL::${ident(name)}, `)}${json}::jsonb)`,
        );
        total += rows.length;
      }
    }
    // The links held back: now every row they point to is there.
    for (const [name, columns] of Object.entries(deferred)) {
      const t = byName.get(name)!;
      const set = columns.map((c) => `${ident(c)} = j.${ident(c)}`).join(', ');
      for await (const rows of rowsOf(t.file, BATCH)) {
        await tx.execute(
          sql`${sql.raw(`UPDATE ${ident(name)} AS t SET ${set} FROM jsonb_populate_recordset(NULL::${ident(name)}, `)}${JSON.stringify(rows)}::jsonb) AS j WHERE t.id = j.id`,
        );
      }
    }
    // Every file has just been stored under the current key.
    const keyId = currentFileKeyId();
    await tx.execute(sql`UPDATE documents SET encryption_key_id = ${keyId}`);
    await tx.execute(sql`UPDATE email_inbox SET encryption_key_id = ${keyId}`);
    const [still] = (await tx.execute(
      sql`SELECT id FROM users WHERE id = ${actor}`,
    )) as unknown as { id: string }[];
    await recordAudit(tx, {
      actorUserId: still ? actor : null,
      action: 'system.restore',
      entityType: 'system',
      entityId: actor,
      after: { ...summary, rows: total },
    });
  });
  return { rows: total };
}
