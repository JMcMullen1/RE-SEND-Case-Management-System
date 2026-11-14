import { sql } from 'drizzle-orm';
import { getDb } from '../db/client';

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

/** Every row of one exported table, columns as stored (minus omitted ones). */
export async function exportTableRows(
  table: string,
  omit: string[] = [],
): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
  if (!EXPORT_TABLES.some((t) => t.table === table))
    throw new Error(`Table ${table} is not exportable`);
  const cols = (await getDb().execute(
    sql`SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table}
        ORDER BY ordinal_position`,
  )) as unknown as { column_name: string }[];
  const columns = cols
    .map((c) => c.column_name)
    .filter((c) => !omit.includes(c));
  const list = columns.map((c) => `"${c}"`).join(', ');
  const rows = (await getDb().execute(
    sql.raw(`SELECT ${list} FROM "${table}" ORDER BY 1`),
  )) as unknown as Record<string, unknown>[];
  return { columns, rows };
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
