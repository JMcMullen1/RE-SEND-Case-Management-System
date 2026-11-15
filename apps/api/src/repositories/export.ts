import { sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { decryptField } from '../crypto/encryption';
import { SENSITIVE_COLUMNS } from '../crypto/sensitive-fields';
import { recordAudit } from './audit';

/**
 * Every table holding the charity's data, in the order a reader would want
 * them, with columns left out of the export. Only `users.ical_token` is
 * withheld: it is a credential (it opens a person's calendar feed), not data.
 * A new table is added here so the export stays complete; the export test
 * fails if a table in the database is missing from this list.
 */
export const EXPORT_TABLES: { table: string; omit?: string[] }[] = [
  { table: 'clients' },
  { table: 'children' },
  { table: 'client_children' },
  { table: 'cases' },
  { table: 'case_teams' },
  { table: 'teams' },
  { table: 'case_notes' },
  { table: 'key_dates' },
  { table: 'case_reviews' },
  { table: 'documents' },
  { table: 'emails' },
  { table: 'time_entries' },
  { table: 'schools' },
  { table: 'school_contacts' },
  { table: 'case_schools' },
  { table: 'drafts' },
  { table: 'users', omit: ['ical_token'] },
  { table: 'user_rates' },
  { table: 'saved_views' },
  { table: 'audit_log' },
  { table: 'ai_job_runs' },
  { table: 'ai_job_flags' },
];

/** Internal bookkeeping tables that are not the charity's data. */
export const EXPORT_EXCLUDED_TABLES = ['fixture_marker'];

/** The tables actually in the database (for the completeness check). */
export async function databaseTables(): Promise<string[]> {
  const rows = (await getDb().execute(
    sql`SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          AND table_name NOT LIKE '\\_\\_%'
        ORDER BY table_name`,
  )) as unknown as { table_name: string }[];
  return rows.map((r) => r.table_name);
}

/** The exported columns of a table (minus omitted ones), in table order. */
export async function exportTableColumns(
  table: string,
  omit: string[] = [],
): Promise<string[]> {
  if (!EXPORT_TABLES.some((t) => t.table === table))
    throw new Error(`Table ${table} is not exportable`);
  const cols = (await getDb().execute(
    sql`SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table}
          -- Generated columns (search vectors) are derived, not records.
          AND is_generated = 'NEVER'
        ORDER BY ordinal_position`,
  )) as unknown as { column_name: string }[];
  return cols.map((c) => c.column_name).filter((c) => !omit.includes(c));
}

/**
 * One page of a table's rows, so a large table (the audit log) is read and
 * written a page at a time rather than held in memory whole. Table and column
 * names come only from EXPORT_TABLES and the database's own catalogue.
 */
export async function exportTablePage(
  table: string,
  columns: string[],
  offset: number,
  limit: number,
): Promise<Record<string, unknown>[]> {
  if (!EXPORT_TABLES.some((t) => t.table === table))
    throw new Error(`Table ${table} is not exportable`);
  const list = columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
  const rows = (await getDb().execute(
    sql.raw(
      `SELECT ${list} FROM "${table}" ORDER BY 1 LIMIT ${Math.trunc(limit)} OFFSET ${Math.trunc(offset)}`,
    ),
  )) as unknown as Record<string, unknown>[];
  // The export is the charity's own readable copy: encrypted fields (and
  // encrypted values the audit trail recorded) are written decrypted.
  const sensitive =
    SENSITIVE_COLUMNS[table as keyof typeof SENSITIVE_COLUMNS] ?? [];
  return rows.map((row) => {
    const out = { ...row };
    for (const column of sensitive)
      out[column] = decryptField(out[column] as string | null);
    if (table === 'audit_log')
      for (const column of ['before', 'after'])
        if (column in out) out[column] = decryptDeep(out[column]);
    return out;
  });
}

/** Any encrypted strings within a JSON value, decrypted. */
function decryptDeep(value: unknown): unknown {
  if (typeof value === 'string') return decryptField(value);
  if (Array.isArray(value)) return value.map(decryptDeep);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, decryptDeep(v)]),
    );
  return value;
}

/** Audit an export: who started it, and how it ended (counts only). */
export async function recordExportEvent(
  actor: string,
  action: 'export.download' | 'export.complete' | 'export.failed',
  after?: Record<string, unknown>,
): Promise<void> {
  await recordAudit(getDb(), {
    actorUserId: actor,
    action,
    entityType: 'system',
    entityId: actor,
    after,
  });
}

/** Every stored document file, with the case it belongs to. */
export async function exportDocumentFiles(): Promise<
  {
    id: string;
    caseReference: string;
    filename: string;
    version: number;
    storageKey: string;
    deleted: boolean;
  }[]
> {
  const rows = (await getDb().execute(
    sql`SELECT d.id, c.case_reference, d.original_filename, d.version,
               d.storage_key, d.deleted_at IS NOT NULL AS deleted
        FROM documents d JOIN cases c ON c.id = d.case_id
        ORDER BY c.case_reference, d.original_filename, d.version`,
  )) as unknown as {
    id: string;
    case_reference: string;
    original_filename: string;
    version: number;
    storage_key: string;
    deleted: boolean;
  }[];
  return rows.map((r) => ({
    id: r.id,
    caseReference: r.case_reference,
    filename: r.original_filename,
    version: r.version,
    storageKey: r.storage_key,
    deleted: r.deleted,
  }));
}
