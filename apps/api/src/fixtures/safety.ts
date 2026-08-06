import type postgres from 'postgres';
import { env } from '../env';

type Sql = ReturnType<typeof postgres>;

/**
 * Refusal to run — a deliberate, expected stop (production, or a database that
 * isn't ours to touch). Reported as a clean message, not a stack trace.
 */
export class FixtureRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FixtureRefusal';
  }
}

/** Marker table proving a database's data was created by the fixture loader. */
export const MARKER_TABLE = 'fixture_marker';

/**
 * Every table the fixtures own. Truncated by `clear`, and reload wipes them
 * before reseeding. `teams` is included so the database goes back to nothing;
 * the loader re-seeds the standing teams.
 */
export const FIXTURE_TABLES = [
  'case_teams',
  'client_children',
  'case_notes',
  'key_dates',
  'case_reviews',
  'documents',
  'emails',
  'time_entries',
  'audit_log',
  'cases',
  'clients',
  'children',
  'users',
  'teams',
] as const;

/**
 * Tables whose contents would count as "not created by the fixture loader".
 * Excludes `teams` (seeded by the migration as reference data) and the marker.
 */
const FOREIGN_CHECK_TABLES = FIXTURE_TABLES.filter((t) => t !== 'teams');

function assertNotProduction(): void {
  if (env.NODE_ENV === 'production') {
    throw new FixtureRefusal(
      'NODE_ENV is production. Fixtures never run against production.',
    );
  }
  if (!env.DATABASE_URL) {
    throw new FixtureRefusal('DATABASE_URL is not set.');
  }
}

async function assertSchemaPresent(sql: Sql): Promise<void> {
  const rows = await sql<{ present: boolean }[]>`
    SELECT to_regclass('public.cases') IS NOT NULL AS present
  `;
  if (!rows[0]?.present) {
    throw new FixtureRefusal(
      'Schema is not migrated. Run `npm run db:migrate -w @re-send/api` first.',
    );
  }
}

export async function hasFixtureMarker(sql: Sql): Promise<boolean> {
  const present = await sql<{ present: boolean }[]>`
    SELECT to_regclass(${'public.' + MARKER_TABLE}) IS NOT NULL AS present
  `;
  if (!present[0]?.present) return false;
  const counted = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM ${sql(MARKER_TABLE)}
  `;
  return (counted[0]?.count ?? 0) > 0;
}

async function foreignRowCount(sql: Sql): Promise<number> {
  const union = FOREIGN_CHECK_TABLES.map(
    (t) => `SELECT count(*)::int AS c FROM "${t}"`,
  ).join(' UNION ALL ');
  const rows = await sql.unsafe<{ total: number }[]>(
    `SELECT coalesce(sum(c), 0)::int AS total FROM (${union}) s`,
  );
  return rows[0]?.total ?? 0;
}

/**
 * Shared guard for both commands. Refuses in production, refuses when the
 * schema is missing, and refuses when the database holds rows the fixture
 * loader did not create. Returns whether this is already a fixture database.
 */
export async function assertSafeToMutate(
  sql: Sql,
): Promise<{ isFixtureDatabase: boolean }> {
  assertNotProduction();
  await assertSchemaPresent(sql);

  const isFixtureDatabase = await hasFixtureMarker(sql);
  if (!isFixtureDatabase) {
    const foreign = await foreignRowCount(sql);
    if (foreign > 0) {
      throw new FixtureRefusal(
        `Database already contains ${foreign} row(s) not created by the fixture ` +
          'loader. Refusing to modify it. Use a disposable development database.',
      );
    }
  }
  return { isFixtureDatabase };
}

/** Empty every fixture-owned table. */
export async function truncateAll(sql: Sql): Promise<void> {
  const list = FIXTURE_TABLES.map((t) => `"${t}"`).join(', ');
  await sql.unsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export async function writeMarker(sql: Sql): Promise<void> {
  await sql.unsafe(
    `CREATE TABLE IF NOT EXISTS ${MARKER_TABLE} (loaded_at timestamptz NOT NULL DEFAULT now())`,
  );
  await sql.unsafe(`DELETE FROM ${MARKER_TABLE}`);
  await sql.unsafe(`INSERT INTO ${MARKER_TABLE} DEFAULT VALUES`);
}

export async function dropMarker(sql: Sql): Promise<void> {
  await sql.unsafe(`DROP TABLE IF EXISTS ${MARKER_TABLE}`);
}
