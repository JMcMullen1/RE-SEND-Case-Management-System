import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import {
  earningsPence,
  type CaseTimeSummary,
  type RateKind,
  type StaffRates,
  type TimeReport,
} from '@re-send/shared';
import { getDb } from '../db/client';
import {
  caseNotes,
  cases,
  children,
  timeEntries,
  userRates,
  users,
} from '../db/schema';
import { recordAudit } from './audit';

const liveEntry = isNull(timeEntries.deletedAt);

/** The pay rate in force for a time entry: the latest one dated on or before it. */
const payRateAtEntry = sql<number | null>`(
  SELECT r.rate_pence FROM ${userRates} r
  WHERE r.user_id = ${timeEntries.userId}
    AND r.kind = 'pay'
    AND r.effective_from <= ${timeEntries.entryDate}
  ORDER BY r.effective_from DESC
  LIMIT 1
)`;

/** Time recorded on one case, for the Billables tab. */
export async function caseTimeSummary(
  caseId: string,
): Promise<CaseTimeSummary> {
  const db = getDb();
  const byPerson = await db
    .select({
      userId: timeEntries.userId,
      name: users.displayName,
      minutes: sql<number>`sum(${timeEntries.minutes})::int`,
    })
    .from(timeEntries)
    .innerJoin(users, eq(users.id, timeEntries.userId))
    .where(and(eq(timeEntries.caseId, caseId), liveEntry))
    .groupBy(timeEntries.userId, users.displayName)
    .orderBy(desc(sql`sum(${timeEntries.minutes})`));

  const [missing] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(caseNotes)
    .where(
      and(
        eq(caseNotes.caseId, caseId),
        eq(caseNotes.kind, 'billable'),
        isNull(caseNotes.deletedAt),
        sql`NOT EXISTS (
          SELECT 1 FROM ${timeEntries} t
          WHERE t.note_id = ${caseNotes.id} AND t.deleted_at IS NULL
        )`,
      ),
    );

  return {
    totalMinutes: byPerson.reduce((sum, p) => sum + p.minutes, 0),
    byPerson,
    missingTimeCount: missing?.n ?? 0,
  };
}

/**
 * One person's recorded time between two dates (inclusive), with what it
 * earned at the pay rate in force on each entry's date, and the billables they
 * wrote that still have no time.
 */
export async function timeReport(
  userId: string,
  from: string,
  to: string,
): Promise<TimeReport | null> {
  const db = getDb();
  const [person] = await db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(eq(users.id, userId));
  if (!person) return null;

  const rows = await db
    .select({
      id: timeEntries.id,
      noteId: timeEntries.noteId,
      caseId: timeEntries.caseId,
      caseReference: cases.caseReference,
      childName: sql<
        string | null
      >`coalesce(${children.preferredName}, ${children.fullName})`,
      entryDate: timeEntries.entryDate,
      minutes: timeEntries.minutes,
      narrative: sql<
        string | null
      >`coalesce(${timeEntries.narrative}, ${caseNotes.body})`,
      payRate: payRateAtEntry,
      caseDeleted: sql<boolean>`${cases.deletedAt} IS NOT NULL`,
    })
    .from(timeEntries)
    .innerJoin(cases, eq(cases.id, timeEntries.caseId))
    .leftJoin(children, eq(children.id, cases.childId))
    .leftJoin(caseNotes, eq(caseNotes.id, timeEntries.noteId))
    .where(
      and(
        eq(timeEntries.userId, userId),
        liveEntry,
        // Time on a case deleted since still counts: the work was done.
        gte(timeEntries.entryDate, from),
        lte(timeEntries.entryDate, to),
      ),
    )
    .orderBy(desc(timeEntries.entryDate), desc(timeEntries.createdAt));

  const entries = rows.map(({ payRate, ...r }) => ({
    ...r,
    earningsPence:
      payRate === null ? null : earningsPence(r.minutes, Number(payRate)),
  }));
  const priced = entries.filter((e) => e.earningsPence !== null);

  const missingTime = await db
    .select({
      noteId: caseNotes.id,
      caseId: caseNotes.caseId,
      caseReference: cases.caseReference,
      entryDate: caseNotes.entryDate,
    })
    .from(caseNotes)
    .innerJoin(cases, eq(cases.id, caseNotes.caseId))
    .where(
      and(
        eq(caseNotes.authorUserId, userId),
        eq(caseNotes.kind, 'billable'),
        isNull(caseNotes.deletedAt),
        isNull(cases.deletedAt),
        sql`NOT EXISTS (
          SELECT 1 FROM ${timeEntries} t
          WHERE t.note_id = ${caseNotes.id} AND t.deleted_at IS NULL
        )`,
      ),
    )
    .orderBy(desc(caseNotes.entryDate));

  return {
    userId: person.id,
    userName: person.name,
    from,
    to,
    totalMinutes: entries.reduce((s, e) => s + e.minutes, 0),
    totalEarningsPence: priced.length
      ? priced.reduce((s, e) => s + e.earningsPence!, 0)
      : null,
    entriesWithoutRate: entries.length - priced.length,
    entries,
    missingTime,
  };
}

/**
 * Every active member of staff with the rates in force today, and their full
 * rate history (upcoming rates included, newest first).
 */
export async function listStaffRates(today: string): Promise<StaffRates[]> {
  const db = getDb();
  const staff = await db
    .select({ id: users.id, displayName: users.displayName, role: users.role })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.displayName));
  const rates = await db
    .select()
    .from(userRates)
    .orderBy(desc(userRates.effectiveFrom));

  const current = (userId: string, kind: RateKind) => {
    const r = rates.find(
      (x) => x.userId === userId && x.kind === kind && x.effectiveFrom <= today,
    );
    return r
      ? { ratePence: r.ratePence, effectiveFrom: r.effectiveFrom }
      : null;
  };
  return staff.map((u) => ({
    userId: u.id,
    displayName: u.displayName,
    role: u.role,
    pay: current(u.id, 'pay'),
    work: current(u.id, 'work'),
    history: rates
      .filter((r) => r.userId === u.id)
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        ratePence: r.ratePence,
        effectiveFrom: r.effectiveFrom,
      })),
  }));
}

/**
 * Remove a rate set in error (audited). Time it applied to falls back to the
 * rate before it, if any. Returns false when there was no such rate.
 */
export async function deleteRate(id: string, actor: string): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const [removed] = await tx
      .delete(userRates)
      .where(eq(userRates.id, id))
      .returning();
    if (!removed) return false;
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'rate.delete',
      entityType: 'user_rate',
      entityId: id,
      before: {
        userId: removed.userId,
        kind: removed.kind,
        ratePence: removed.ratePence,
        effectiveFrom: removed.effectiveFrom,
      },
    });
    return true;
  });
}

/**
 * Set a rate from a date. Setting the same rate kind for the same date again
 * replaces it. Earlier rates are kept, so time already recorded keeps the rate
 * that applied when it was worked. Audited.
 */
export async function setRate(
  input: {
    userId: string;
    kind: RateKind;
    ratePence: number;
    effectiveFrom: string;
  },
  actor: string,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(userRates)
      .where(
        and(
          eq(userRates.userId, input.userId),
          eq(userRates.kind, input.kind),
          eq(userRates.effectiveFrom, input.effectiveFrom),
        ),
      );
    const [row] = await tx
      .insert(userRates)
      .values({ ...input, setByUserId: actor })
      .onConflictDoUpdate({
        target: [userRates.userId, userRates.kind, userRates.effectiveFrom],
        set: {
          ratePence: input.ratePence,
          setByUserId: actor,
          updatedAt: new Date(),
        },
      })
      .returning({ id: userRates.id });
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'rate.set',
      entityType: 'user_rate',
      entityId: row!.id,
      before: before ? { ratePence: before.ratePence } : undefined,
      after: {
        userId: input.userId,
        kind: input.kind,
        ratePence: input.ratePence,
        effectiveFrom: input.effectiveFrom,
      },
    });
  });
}
