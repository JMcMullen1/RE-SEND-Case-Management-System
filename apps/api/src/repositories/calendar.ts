import { randomBytes } from 'node:crypto';
import { eq, sql, type SQL } from 'drizzle-orm';
import type {
  CalendarEvent,
  CalendarFilters,
  KeyDateType,
  Status,
  Team,
} from '@re-send/shared';
import { getDb } from '../db/client';
import { users } from '../db/schema';

/**
 * The calendar query. Key dates across every case, joined to the case context
 * the calendar shows — reference, child preferred name, status, owner and teams.
 * Hand-written SQL for the same reason as the case list: a many-to-many team
 * filter and per-row team aggregation in one pass. Every value is parameterised
 * through Drizzle's `sql` template.
 */

interface RawRow {
  key_date_id: string;
  case_id: string;
  case_reference: string;
  child_name: string | null;
  title: string;
  type: string;
  date: string;
  time: string | null;
  status: string;
  owner_user_id: string | null;
  owner_name: string | null;
  team_codes: string[];
  superseded: boolean;
  source_reference: string | null;
}

function mapRow(r: RawRow): CalendarEvent {
  return {
    keyDateId: r.key_date_id,
    caseId: r.case_id,
    caseReference: r.case_reference,
    childName: r.child_name,
    title: r.title,
    type: r.type as KeyDateType,
    date: r.date,
    time: r.time,
    status: r.status as Status,
    ownerUserId: r.owner_user_id,
    ownerName: r.owner_name,
    teamCodes: (r.team_codes ?? []) as Team[],
    superseded: r.superseded,
    sourceReference: r.source_reference,
  };
}

function inList(col: SQL, values: readonly (string | number)[]): SQL {
  return sql`${col} IN (${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )})`;
}

/**
 * Build the WHERE conditions for the calendar. `scope` decides whose dates: mine
 * (cases I own), a named person, or everyone. Superseded entries are excluded
 * unless history is explicitly toggled on.
 */
function buildConditions(
  filters: CalendarFilters,
  currentUserId: string | null,
): SQL[] {
  const conds: SQL[] = [sql`k.deleted_at IS NULL`];

  if (!filters.includeSuperseded) conds.push(sql`k.superseded_at IS NULL`);

  if (filters.scope === 'mine' && currentUserId)
    conds.push(sql`c.owner_user_id = ${currentUserId}`);
  else if (filters.scope === 'user' && filters.userId)
    conds.push(sql`c.owner_user_id = ${filters.userId}`);

  if (filters.team)
    conds.push(
      sql`EXISTS (SELECT 1 FROM case_teams ct JOIN teams t ON t.id = ct.team_id WHERE ct.case_id = c.id AND t.code = ${filters.team})`,
    );

  if (filters.types?.length)
    conds.push(inList(sql`k.type::text`, filters.types));

  if (filters.statuses?.length)
    conds.push(inList(sql`c.status::text`, filters.statuses));

  if (filters.from) conds.push(sql`k.date >= ${filters.from}`);
  if (filters.to) conds.push(sql`k.date <= ${filters.to}`);

  return conds;
}

export async function listCalendarEvents(
  filters: CalendarFilters,
  currentUserId: string | null,
): Promise<CalendarEvent[]> {
  const db = getDb();
  const conds = buildConditions(filters, currentUserId);
  const where = sql.join(conds, sql` AND `);

  const result = await db.execute(sql`
    SELECT
      k.id AS key_date_id,
      c.id AS case_id,
      c.case_reference,
      ch.preferred_name AS child_name,
      k.title,
      k.type::text AS type,
      k.date,
      to_char(k.time, 'HH24:MI') AS time,
      c.status::text AS status,
      c.owner_user_id,
      ou.display_name AS owner_name,
      COALESCE(
        (SELECT array_agg(t.code ORDER BY t.code)
         FROM case_teams ct JOIN teams t ON t.id = ct.team_id
         WHERE ct.case_id = c.id),
        '{}'
      ) AS team_codes,
      (k.superseded_at IS NOT NULL) AS superseded,
      k.source_reference
    FROM key_dates k
    JOIN cases c ON c.id = k.case_id
    LEFT JOIN children ch ON ch.id = c.child_id AND ch.deleted_at IS NULL
    LEFT JOIN users ou ON ou.id = c.owner_user_id
    WHERE ${where}
    ORDER BY k.date ASC, k.time ASC NULLS LAST, k.id
  `);

  return (result as unknown as RawRow[]).map(mapRow);
}

/** A case match for the calendar's "add key date" case picker. */
export interface CalendarCaseMatch {
  id: string;
  caseReference: string;
  childName: string | null;
  clientName: string | null;
}

/** Typeahead over cases by reference, client or child name, for adding a date. */
export async function searchCasesForCalendar(
  q: string,
  limit = 10,
): Promise<CalendarCaseMatch[]> {
  const db = getDb();
  const like = `%${q}%`;
  const result = await db.execute(sql`
    SELECT
      c.id,
      c.case_reference,
      ch.preferred_name AS child_name,
      cl.display_name AS client_name
    FROM cases c
    LEFT JOIN clients cl ON cl.id = c.client_id AND cl.deleted_at IS NULL
    LEFT JOIN children ch ON ch.id = c.child_id AND ch.deleted_at IS NULL
    WHERE c.case_reference ILIKE ${like}
       OR cl.display_name ILIKE ${like}
       OR cl.full_name ILIKE ${like}
       OR ch.preferred_name ILIKE ${like}
       OR ch.full_name ILIKE ${like}
    ORDER BY c.case_reference DESC
    LIMIT ${limit}
  `);
  return (
    result as unknown as {
      id: string;
      case_reference: string;
      child_name: string | null;
      client_name: string | null;
    }[]
  ).map((r) => ({
    id: r.id,
    caseReference: r.case_reference,
    childName: r.child_name,
    clientName: r.client_name,
  }));
}

// --- iCal feed token --------------------------------------------------------

/**
 * Resolve (creating if needed) the opaque token for a user's iCal feed. The
 * token authenticates a read-only feed URL — the one credential a phone's
 * calendar app can carry — and is set lazily the first time it is asked for.
 */
export async function ensureIcalToken(userId: string): Promise<string | null> {
  const db = getDb();
  const [existing] = await db
    .select({ token: users.icalToken })
    .from(users)
    .where(eq(users.id, userId));
  if (!existing) return null;
  if (existing.token) return existing.token;

  const token = randomBytes(24).toString('base64url');
  await db.update(users).set({ icalToken: token }).where(eq(users.id, userId));
  return token;
}

/** Rotate a user's iCal token, revoking the previous feed URL. */
export async function rotateIcalToken(userId: string): Promise<string | null> {
  const db = getDb();
  const token = randomBytes(24).toString('base64url');
  const rows = await db
    .update(users)
    .set({ icalToken: token })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return rows.length > 0 ? token : null;
}

/** The user behind a feed token, or null if the token is unknown/revoked. */
export async function userForIcalToken(
  token: string,
): Promise<{ id: string; displayName: string } | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.icalToken, token));
  return row ?? null;
}
