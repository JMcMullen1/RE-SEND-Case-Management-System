import { sql } from 'drizzle-orm';
import { getDb } from '../db/client';

/**
 * The domain tables emptied by a demo reset — every table that holds case data,
 * back to a blank case list. `users` and `teams` are deliberately kept: the
 * staff accounts you sign in as, and the standing reference teams, must survive
 * so the walkthrough can be run again immediately.
 */
const DEMO_RESET_TABLES = [
  'case_teams',
  'client_children',
  'case_notes',
  'key_dates',
  'case_reviews',
  'documents',
  'emails',
  'time_entries',
  'audit_log',
  'ai_job_runs',
  'ai_job_flags',
  'saved_views',
  'cases',
  'clients',
  'children',
] as const;

/**
 * Empty every case-data table in one transaction, returning to a blank case
 * list. TRUNCATE ... CASCADE clears dependents; RESTART IDENTITY resets any
 * sequences. Only ever called behind the DEMO_MODE guard.
 */
export async function resetDemoData(): Promise<void> {
  const db = getDb();
  const list = DEMO_RESET_TABLES.map((t) => `"${t}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`));
}
