import { eq, sql, type SQL } from 'drizzle-orm';
import type {
  CaseFilters,
  CaseListRow,
  NoteKind,
  OwnerQueue,
  SortId,
} from '@re-send/shared';
import { getDb } from '../db/client';
import { auditLog, cases } from '../db/schema';

/**
 * The case list query. This is deliberately hand-written SQL: the screen needs
 * a many-to-many team filter, computed key-date selection, note/review recency
 * and consent, all in one pass. Every value is parameterised through Drizzle's
 * `sql` template — no string interpolation of user input.
 */

const TODAY = sql`(now() AT TIME ZONE 'Europe/London')::date`;

function inList(col: SQL, values: readonly (string | number)[]): SQL {
  return sql`${col} IN (${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )})`;
}

/** One boolean condition per active facet, keyed by facet id. */
function buildConditions(
  f: CaseFilters,
  currentUserId: string | null,
): Record<string, SQL> {
  const c: Record<string, SQL> = {};

  if (f.mine && currentUserId) c.mine = sql`c.owner_user_id = ${currentUserId}`;
  if (f.unassigned) c.unassigned = sql`c.owner_queue IS NOT NULL`;
  if (f.staff?.length) c.staff = inList(sql`c.owner_user_id`, f.staff);
  if (f.dealingShadow?.length) {
    c.dealingShadow = sql`(${inList(sql`c.owner_user_id`, f.dealingShadow)} OR ${inList(sql`c.shadow_user_id`, f.dealingShadow)})`;
  }
  if (f.status?.length) c.status = inList(sql`c.status::text`, f.status);
  if (f.team?.length) {
    c.team = sql`EXISTS (SELECT 1 FROM case_teams ct JOIN teams t ON t.id = ct.team_id WHERE ct.case_id = c.id AND ${inList(sql`t.code`, f.team)})`;
  }
  if (f.workType?.length)
    c.workType = inList(sql`c.current_work::text`, f.workType);
  if (f.queryType?.length)
    c.queryType = inList(sql`c.original_query::text`, f.queryType);
  if (f.enquiryMethod?.length) {
    c.enquiryMethod = inList(sql`c.method_of_enquiry::text`, f.enquiryMethod);
  }
  if (f.enquiryYear?.length) {
    c.enquiryYear = inList(
      sql`EXTRACT(YEAR FROM c.date_of_enquiry)::int`,
      f.enquiryYear,
    );
  }
  if (f.paymentCode?.length)
    c.paymentCode = inList(sql`c.payment_code::text`, f.paymentCode);
  if (f.discountCode?.length)
    c.discountCode = inList(sql`c.discount_code::text`, f.discountCode);
  if (f.schoolYear?.length)
    c.schoolYear = inList(sql`ch.school_year::text`, f.schoolYear);
  if (f.consultationState?.length) {
    c.consultationState = inList(
      sql`c.consult_status::text`,
      f.consultationState,
    );
  }

  if (typeof f.noNoteInDays === 'number') {
    c.noNoteInDays = sql`NOT EXISTS (SELECT 1 FROM case_notes n WHERE n.case_id = c.id AND n.deleted_at IS NULL AND n.entry_date > ${TODAY} - ${f.noNoteInDays}::int)`;
  }
  if (typeof f.notReviewedInDays === 'number') {
    c.notReviewedInDays = sql`NOT EXISTS (SELECT 1 FROM case_reviews r WHERE r.case_id = c.id AND r.deleted_at IS NULL AND r.reviewed_at::date > ${TODAY} - ${f.notReviewedInDays}::int)`;
  }
  if (f.keyDatePassed) {
    c.keyDatePassed = sql`(NOT EXISTS (SELECT 1 FROM key_dates k WHERE k.case_id = c.id AND k.deleted_at IS NULL AND k.superseded_at IS NULL AND k.date >= ${TODAY}) AND EXISTS (SELECT 1 FROM key_dates k WHERE k.case_id = c.id AND k.deleted_at IS NULL AND k.superseded_at IS NULL AND k.date < ${TODAY}))`;
  }
  if (typeof f.keyDateWithinDays === 'number') {
    c.keyDateWithinDays = sql`EXISTS (SELECT 1 FROM key_dates k WHERE k.case_id = c.id AND k.deleted_at IS NULL AND k.superseded_at IS NULL AND k.date >= ${TODAY} AND k.date <= ${TODAY} + ${f.keyDateWithinDays}::int)`;
  }
  if (f.noKeyDate) {
    c.noKeyDate = sql`NOT EXISTS (SELECT 1 FROM key_dates k WHERE k.case_id = c.id AND k.deleted_at IS NULL AND k.superseded_at IS NULL)`;
  }
  if (f.missingConsent) {
    c.missingConsent = sql`(c.status = 'Active' AND (cl.id IS NULL OR NOT cl.consent_data_processing OR NOT cl.consent_information_sharing OR NOT cl.consent_contact OR NOT cl.consent_privacy_notice))`;
  }
  return c;
}

function searchCondition(term: string): SQL | null {
  const q = term.trim();
  if (!q) return null;
  const like = `%${q}%`;
  return sql`(cl.full_name ILIKE ${like} OR cl.display_name ILIKE ${like} OR ch.full_name ILIKE ${like} OR ch.preferred_name ILIKE ${like} OR c.case_reference ILIKE ${like} OR EXISTS (SELECT 1 FROM case_notes n WHERE n.case_id = c.id AND n.deleted_at IS NULL AND n.body ILIKE ${like}))`;
}

function whereClause(conditions: SQL[]): SQL {
  const all = [sql`c.deleted_at IS NULL`, ...conditions];
  return sql.join(all, sql` AND `);
}

const ORDER_BY: Record<SortId, SQL> = {
  keyDateSoonest: sql`primary_date ASC NULLS LAST, cl.display_name ASC`,
  clientName: sql`cl.display_name ASC NULLS LAST`,
  childName: sql`COALESCE(ch.preferred_name, ch.full_name) ASC NULLS LAST`,
  dateAddedNewest: sql`c.date_of_enquiry DESC NULLS LAST`,
  dateAddedOldest: sql`c.date_of_enquiry ASC NULLS LAST`,
  lastUpdatedNewest: sql`most_recent_note_date DESC NULLS LAST`,
  lastUpdatedOldest: sql`most_recent_note_date ASC NULLS FIRST`,
  lastReviewedOldest: sql`last_reviewed_at ASC NULLS FIRST`,
  staffThenKeyDate: sql`owner_sort ASC NULLS LAST, primary_date ASC NULLS LAST`,
};

interface RawRow {
  id: string;
  client_id: string | null;
  client_name: string | null;
  child_name: string | null;
  current_work: string | null;
  original_query: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_queue: string | null;
  status: string;
  shadow_name: string | null;
  team_codes: string[];
  date_of_enquiry: string | null;
  method_of_enquiry: string | null;
  school_year: string | null;
  payment_code: string | null;
  discount_code: string | null;
  invoice_status_text: string | null;
  consult_status: string;
  most_recent_note_date: string | null;
  last_reviewed_at: string | null;
  key_dates: CaseListRow['keyDates'];
}

function mapRow(r: RawRow): CaseListRow {
  const owner: CaseListRow['owner'] = r.owner_user_id
    ? { kind: 'user', userId: r.owner_user_id, displayName: r.owner_name ?? '' }
    : { kind: 'queue', queue: (r.owner_queue ?? 'Enquiries') as never };
  return {
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    childName: r.child_name,
    currentWork: r.current_work,
    originalQuery: r.original_query,
    owner,
    status: r.status as CaseListRow['status'],
    shadowUserName: r.shadow_name,
    team: (r.team_codes ?? []) as CaseListRow['team'],
    dateOfEnquiry: r.date_of_enquiry,
    methodOfEnquiry: r.method_of_enquiry as CaseListRow['methodOfEnquiry'],
    schoolYear: r.school_year,
    paymentCode: r.payment_code,
    discountCode: r.discount_code,
    invoiceStatusText: r.invoice_status_text,
    consultStatus: r.consult_status as CaseListRow['consultStatus'],
    mostRecentNoteDate: r.most_recent_note_date,
    lastReviewedAt: r.last_reviewed_at,
    keyDates: r.key_dates ?? [],
  };
}

export interface CaseListQuery {
  filters: CaseFilters;
  search: string;
  sort: SortId;
  limit: number;
  offset: number;
  currentUserId: string | null;
}

const SELECT_ROW = sql`
  c.id,
  cl.id AS client_id,
  cl.display_name AS client_name,
  COALESCE(ch.preferred_name, ch.full_name) AS child_name,
  c.current_work::text AS current_work,
  c.original_query::text AS original_query,
  c.owner_user_id,
  ou.display_name AS owner_name,
  c.owner_queue::text AS owner_queue,
  c.status::text AS status,
  su.display_name AS shadow_name,
  COALESCE(ou.display_name, c.owner_queue::text) AS owner_sort,
  c.date_of_enquiry,
  c.method_of_enquiry::text AS method_of_enquiry,
  ch.school_year::text AS school_year,
  c.payment_code::text AS payment_code,
  c.discount_code::text AS discount_code,
  c.invoice_status_text,
  c.consult_status::text AS consult_status,
  (SELECT max(n.entry_date) FROM case_notes n WHERE n.case_id = c.id AND n.deleted_at IS NULL) AS most_recent_note_date,
  (SELECT max(r.reviewed_at) FROM case_reviews r WHERE r.case_id = c.id AND r.deleted_at IS NULL) AS last_reviewed_at,
  COALESCE((SELECT array_agg(t.code ORDER BY t.code) FROM case_teams ct JOIN teams t ON t.id = ct.team_id WHERE ct.case_id = c.id), '{}') AS team_codes,
  COALESCE((
    SELECT json_agg(json_build_object('id', k.id, 'date', k.date, 'time', k.time, 'type', k.type, 'title', k.title) ORDER BY k.date)
    FROM key_dates k WHERE k.case_id = c.id AND k.deleted_at IS NULL AND k.superseded_at IS NULL
  ), '[]'::json) AS key_dates,
  COALESCE(
    (SELECT min(k.date) FROM key_dates k WHERE k.case_id = c.id AND k.deleted_at IS NULL AND k.superseded_at IS NULL AND k.date >= ${TODAY}),
    (SELECT max(k.date) FROM key_dates k WHERE k.case_id = c.id AND k.deleted_at IS NULL AND k.superseded_at IS NULL AND k.date < ${TODAY})
  ) AS primary_date
`;

const FROM_JOINS = sql`
  FROM cases c
  LEFT JOIN clients cl ON cl.id = c.client_id AND cl.deleted_at IS NULL
  LEFT JOIN children ch ON ch.id = c.child_id AND ch.deleted_at IS NULL
  LEFT JOIN users ou ON ou.id = c.owner_user_id
  LEFT JOIN users su ON su.id = c.shadow_user_id
`;

export async function listCases(
  query: CaseListQuery,
): Promise<{ rows: CaseListRow[]; total: number; nextOffset: number | null }> {
  const db = getDb();
  const conditions = Object.values(
    buildConditions(query.filters, query.currentUserId),
  );
  const search = searchCondition(query.search);
  const all = search ? [...conditions, search] : conditions;
  const where = whereClause(all);
  const order = ORDER_BY[query.sort] ?? ORDER_BY.keyDateSoonest;

  const rowsResult = await db.execute(sql`
    SELECT ${SELECT_ROW}
    ${FROM_JOINS}
    WHERE ${where}
    ORDER BY ${order}, c.id
    LIMIT ${query.limit} OFFSET ${query.offset}
  `);
  const countResult = await db.execute(sql`
    SELECT count(*)::int AS total ${FROM_JOINS} WHERE ${where}
  `);

  const rows = (rowsResult as unknown as RawRow[]).map(mapRow);
  const total = Number(
    (countResult as unknown as { total: number }[])[0]?.total ?? 0,
  );
  const nextOffset =
    query.offset + rows.length < total ? query.offset + rows.length : null;
  return { rows, total, nextOffset };
}

export async function getCaseRow(id: string): Promise<CaseListRow | null> {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT ${SELECT_ROW} ${FROM_JOINS} WHERE c.id = ${id} AND c.deleted_at IS NULL
  `);
  const raw = (result as unknown as RawRow[])[0];
  return raw ? mapRow(raw) : null;
}

// --- Row expansion ----------------------------------------------------------

export interface CaseExpansion {
  notes: {
    entryDate: string;
    author: string | null;
    body: string;
    kind: NoteKind;
  }[];
  email: string | null;
  phone: string | null;
  mobile: string | null;
}

/** The three most recent notes plus contact details, for the row expander. */
export async function getCaseExpansion(id: string): Promise<CaseExpansion> {
  const db = getDb();
  const notesResult = await db.execute(sql`
    SELECT n.entry_date AS entry_date, u.display_name AS author, n.body AS body, n.kind AS kind
    FROM case_notes n
    LEFT JOIN users u ON u.id = n.author_user_id
    WHERE n.case_id = ${id} AND n.deleted_at IS NULL
    ORDER BY n.entry_date DESC, n.created_at DESC
    LIMIT 3
  `);
  const contactResult = await db.execute(sql`
    SELECT cl.email AS email, cl.phone AS phone, cl.mobile AS mobile
    FROM cases c LEFT JOIN clients cl ON cl.id = c.client_id
    WHERE c.id = ${id}
  `);
  const notes = (
    notesResult as unknown as {
      entry_date: string;
      author: string | null;
      body: string;
      kind: NoteKind;
    }[]
  ).map((n) => ({
    entryDate: n.entry_date,
    author: n.author,
    body: n.body,
    kind: n.kind,
  }));
  const contact = (
    contactResult as unknown as {
      email: string | null;
      phone: string | null;
      mobile: string | null;
    }[]
  )[0];
  return {
    notes,
    email: contact?.email ?? null,
    phone: contact?.phone ?? null,
    mobile: contact?.mobile ?? null,
  };
}

// --- Facet counts -----------------------------------------------------------
// For each facet, count cases per option with every OTHER active filter applied
// (standard faceted search: "how many would I get if I added this option").

async function countByExpr(
  query: CaseListQuery,
  omitFacet: string,
  groupExpr: SQL,
  from: SQL,
): Promise<Record<string, number>> {
  const db = getDb();
  const conds = buildConditions(query.filters, query.currentUserId);
  delete conds[omitFacet];
  const search = searchCondition(query.search);
  const list = Object.values(conds);
  const all = search ? [...list, search] : list;
  const where = whereClause(all);
  const result = await db.execute(sql`
    SELECT ${groupExpr} AS k, count(DISTINCT c.id)::int AS n
    ${from}
    WHERE ${where} AND ${groupExpr} IS NOT NULL
    GROUP BY 1
  `);
  const out: Record<string, number> = {};
  for (const r of result as unknown as { k: string | number; n: number }[]) {
    out[String(r.k)] = Number(r.n);
  }
  return out;
}

const SIMPLE_FACET_EXPR: Record<string, SQL> = {
  staff: sql`c.owner_user_id`,
  status: sql`c.status::text`,
  workType: sql`c.current_work::text`,
  queryType: sql`c.original_query::text`,
  enquiryMethod: sql`c.method_of_enquiry::text`,
  enquiryYear: sql`EXTRACT(YEAR FROM c.date_of_enquiry)::int::text`,
  paymentCode: sql`c.payment_code::text`,
  discountCode: sql`c.discount_code::text`,
  schoolYear: sql`ch.school_year::text`,
  consultationState: sql`c.consult_status::text`,
};

export async function facetCounts(
  query: CaseListQuery,
): Promise<Record<string, Record<string, number>>> {
  const entries = Object.entries(SIMPLE_FACET_EXPR);
  const simple = await Promise.all(
    entries.map(([facet, expr]) =>
      countByExpr(query, facet, expr, FROM_JOINS).then(
        (counts) => [facet, counts] as const,
      ),
    ),
  );

  const team = await countByExpr(
    query,
    'team',
    sql`t.code`,
    sql`${FROM_JOINS} JOIN case_teams ct ON ct.case_id = c.id JOIN teams t ON t.id = ct.team_id`,
  );
  const dealingShadow = await countByExpr(
    query,
    'dealingShadow',
    sql`uid`,
    sql`${FROM_JOINS}, LATERAL unnest(ARRAY[c.owner_user_id, c.shadow_user_id]) AS uid`,
  );

  return {
    ...Object.fromEntries(simple),
    team,
    dealingShadow,
  };
}

// --- Owner reassignment (audited) -------------------------------------------

export type OwnerTarget = { ownerUserId: string } | { ownerQueue: OwnerQueue };

function ownerValues(target: OwnerTarget) {
  return 'ownerUserId' in target
    ? { ownerUserId: target.ownerUserId, ownerQueue: null }
    : { ownerUserId: null, ownerQueue: target.ownerQueue };
}

/** Reassign a case owner and record the change in the audit log. */
export async function reassignOwner(
  caseId: string,
  target: OwnerTarget,
  actorUserId: string | null,
): Promise<CaseListRow | null> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({
        ownerUserId: cases.ownerUserId,
        ownerQueue: cases.ownerQueue,
      })
      .from(cases)
      .where(eq(cases.id, caseId));
    if (!before) return;
    const after = ownerValues(target);
    await tx
      .update(cases)
      .set({ ...after, updatedAt: new Date() })
      .where(eq(cases.id, caseId));
    await tx.insert(auditLog).values({
      actorUserId,
      action: 'case.reassign_owner',
      entityType: 'case',
      entityId: caseId,
      before,
      after,
    });
  });
  return getCaseRow(caseId);
}

/** Bulk reassignment. Returns how many cases were updated. */
export async function reassignMany(
  caseIds: string[],
  target: OwnerTarget,
  actorUserId: string | null,
): Promise<number> {
  let updated = 0;
  for (const id of caseIds) {
    const row = await reassignOwner(id, target, actorUserId);
    if (row) updated += 1;
  }
  return updated;
}
