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
import { EXPORT_TABLES, exportDocumentFiles, type Executor } from './export';
import { recordAudit } from './audit';

/**
 * Backups and restore: the database side. A full export carries, besides its
 * readable CSVs, every table as JSON lines (exact values, sensitive fields
 * decrypted so the backup opens under any key) and a manifest. Restoring puts
 * every row back, with its own id, in one transaction.
 */

/** Which migrations the database has run: a backup restores into the same. */
export async function migrationState(db: Executor = getDb()): Promise<{
  count: number;
  lastHash: string | null;
}> {
  const [row] = (await db.execute(
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

/**
 * The links between the exported tables, from the database's catalogue
 * (pg_constraint, which, unlike information_schema, shows every table whoever
 * owns it).
 */
export async function foreignKeys(
  db: Executor = getDb(),
): Promise<ForeignKey[]> {
  const rows = (await db.execute(
    sql`SELECT c.conrelid::regclass::text AS table,
               a.attname AS column,
               c.confrelid::regclass::text AS references
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'f'
          AND c.connamespace = 'public'::regnamespace`,
  )) as unknown as ForeignKey[];
  const exported = new Set(EXPORT_TABLES.map((t) => t.table));
  const strip = (name: string) =>
    name.replace(/^public\./, '').replace(/"/g, '');
  return rows
    .map((r) => ({
      table: strip(r.table),
      column: r.column,
      references: strip(r.references),
    }))
    .filter((r) => exported.has(r.table) && exported.has(r.references));
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
  db: Executor,
  table: string,
  columns: string[],
  offset: number,
  limit: number,
): Promise<Record<string, unknown>[]> {
  if (!EXPORT_TABLES.some((t) => t.table === table))
    throw new Error(`Table ${table} is not exportable`);
  const list = columns.map(ident).join(', ');
  const rows = (await db.execute(
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

/**
 * Everything a backup reads, from one consistent snapshot: rows exported a
 * minute apart still agree with each other (no row missed or repeated, no
 * note without its case) while staff carry on working.
 */
export interface BackupSnapshot {
  page(
    table: string,
    columns: string[],
    offset: number,
    limit: number,
  ): Promise<Record<string, unknown>[]>;
  documentFiles(): ReturnType<typeof exportDocumentFiles>;
  migrationState(): ReturnType<typeof migrationState>;
}

export async function withBackupSnapshot<T>(
  fn: (snapshot: BackupSnapshot) => Promise<T>,
): Promise<T> {
  return getDb().transaction(
    (tx) =>
      fn({
        page: (table, columns, offset, limit) =>
          backupTablePage(tx, table, columns, offset, limit),
        documentFiles: () => exportDocumentFiles(tx),
        migrationState: () => migrationState(tx),
      }),
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
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

/** Rows from a JSON-lines file, in batches of at most `batch` rows or
 *  roughly `maxBytes` of text (long extracted text makes big rows). */
async function* rowsOf(
  file: string,
  batch: number,
  maxBytes = 4 * 1024 * 1024,
): AsyncGenerator<Record<string, unknown>[]> {
  const lines = createInterface({
    input: createReadStream(file, 'utf8'),
    crlfDelay: Infinity,
  });
  let rows: Record<string, unknown>[] = [];
  let size = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as Record<string, unknown>);
    size += line.length;
    if (rows.length >= batch || size >= maxBytes) {
      yield rows;
      rows = [];
      size = 0;
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

/** A full import's start, check, outcome or failure, outside its transaction. */
export async function recordRestoreEvent(
  actor: string,
  action:
    'system.restore.check' | 'system.restore.started' | 'system.restore.failed',
  after: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  const [still] = (await db.execute(
    sql`SELECT id FROM users WHERE id = ${actor}`,
  )) as unknown as { id: string }[];
  await recordAudit(db, {
    actorUserId: still ? actor : null,
    action,
    entityType: 'system',
    entityId: actor,
    after,
  });
}

/**
 * Replace everything with the backup's rows, in one transaction: every
 * exported table emptied, then refilled in dependency order with the backup's
 * own ids (links that point forward or to the same table filled in after).
 * Sensitive values are encrypted under the current key. Some things are not
 * rewound:
 *
 * - the audit trail: the backup's entries are put back and every entry made
 *   since is kept (an actor no longer in the backup is left blank);
 * - leavers: anyone marked as having left stays so, even if the backup is
 *   from before they left;
 * - calendar links: each person keeps their current one (not in a backup).
 *
 * `put` lists the files just stored under the current key. Returns the rows
 * restored and the people no longer allowed in, to be disconnected.
 */
export async function restoreTables(
  tables: RestoreTable[],
  actor: string,
  put: string[],
  summary: Record<string, unknown>,
): Promise<{ rows: number; signedOut: string[] }> {
  const db = getDb();
  const keys = await foreignKeys();
  const byName = new Map(tables.map((t) => [t.table, t]));
  const { order, deferred } = restorePlan(
    tables.map((t) => t.table),
    keys,
  );
  let total = 0;
  let signedOut: string[] = [];
  await db.transaction(async (tx) => {
    // One restore at a time, and nothing else writing meanwhile: TRUNCATE
    // holds every table until the transaction ends.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('re-send:restore'))`,
    );
    // Rows keep the updated_at they had; no live update per row.
    await tx.execute(sql`SET LOCAL resend.keep_updated_at = 'on'`);
    await tx.execute(sql`SET LOCAL resend.quiet_notify = 'on'`);
    await tx.execute(
      sql`CREATE TEMP TABLE live_audit ON COMMIT DROP AS SELECT * FROM audit_log`,
    );
    await tx.execute(
      sql`CREATE TEMP TABLE live_users ON COMMIT DROP AS
          SELECT id, active, ical_token FROM users`,
    );
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
    // The files just stored are under the current key; the rest keep theirs.
    const keyId = currentFileKeyId();
    const putJson = JSON.stringify(put);
    await tx.execute(
      sql`UPDATE documents SET encryption_key_id = ${keyId}
          WHERE storage_key IN (SELECT jsonb_array_elements_text(${putJson}::jsonb))`,
    );
    await tx.execute(
      sql`UPDATE email_inbox SET encryption_key_id = ${keyId}
          WHERE storage_key IN (SELECT jsonb_array_elements_text(${putJson}::jsonb))`,
    );
    // Not rewound: leavers, calendar links, and the audit trail since.
    await tx.execute(
      sql`UPDATE users u SET active = false
          FROM live_users l WHERE l.id = u.id AND NOT l.active AND u.active`,
    );
    await tx.execute(
      sql`UPDATE users u SET ical_token = l.ical_token
          FROM live_users l WHERE l.id = u.id AND l.ical_token IS NOT NULL`,
    );
    await tx.execute(
      sql`UPDATE live_audit SET actor_user_id = NULL
          WHERE actor_user_id IS NOT NULL
            AND actor_user_id NOT IN (SELECT id FROM users)`,
    );
    await tx.execute(
      sql`INSERT INTO audit_log SELECT * FROM live_audit l
          WHERE NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.id = l.id)`,
    );
    signedOut = (
      (await tx.execute(
        sql`SELECT l.id FROM live_users l LEFT JOIN users u ON u.id = l.id
            WHERE l.active AND (u.id IS NULL OR NOT u.active)`,
      )) as unknown as { id: string }[]
    ).map((r) => r.id);
    const [still] = (await tx.execute(
      sql`SELECT id FROM users WHERE id = ${actor}`,
    )) as unknown as { id: string }[];
    await recordAudit(tx, {
      actorUserId: still ? actor : null,
      action: 'system.restore',
      entityType: 'system',
      entityId: actor,
      after: { ...summary, rows: total, signedOut: signedOut.length },
    });
  });
  return { rows: total, signedOut };
}
