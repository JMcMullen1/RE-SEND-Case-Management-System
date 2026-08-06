import { and, asc, eq, isNull } from 'drizzle-orm';
import type { DirectionApplyRow, KeyDateFull } from '@re-send/shared';
import { getDb } from '../db/client';
import { keyDates } from '../db/schema';
import { recordAudit } from './audit';

function toFull(k: typeof keyDates.$inferSelect): KeyDateFull {
  return {
    id: k.id,
    date: k.date,
    time: k.time,
    title: k.title,
    description: k.description,
    type: k.type,
    source: k.source,
    confidence: k.confidence,
    sourceReference: k.sourceReference,
  };
}

/**
 * The live key dates a diff is computed against — the same set the calendar
 * shows: not soft-deleted, not superseded.
 */
export async function liveKeyDates(caseId: string): Promise<KeyDateFull[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(keyDates)
    .where(
      and(
        eq(keyDates.caseId, caseId),
        isNull(keyDates.deletedAt),
        isNull(keyDates.supersededAt),
      ),
    )
    .orderBy(asc(keyDates.date));
  return rows.map(toFull);
}

function confidenceBucket(c: number): string {
  if (c >= 0.8) return 'high';
  if (c >= 0.5) return 'medium';
  return 'low';
}

export interface ApplyDirectionsInput {
  caseId: string;
  /** The stored order document these dates come from (null in tests). */
  sourceDocumentId: string | null;
  rows: (DirectionApplyRow & { confidence?: number })[];
}

export interface ApplyDirectionsResult {
  created: string[];
  superseded: string[];
  counts: { new: number; moved: number; superseded: number; unchanged: number };
}

/**
 * Apply a reviewed set of directions to the calendar in one transaction, under
 * ONE audit entry covering the whole set.
 *
 * - a **new** date is inserted, sourced from the order;
 * - a **moved** date inserts the replacement, then supersedes the old row —
 *   marking it superseded (never deleting it) and pointing it at its successor,
 *   so the case file shows how the timetable evolved;
 * - a **superseded** (vacated) date supersedes the old row with no replacement;
 * - **unchanged** and un-included rows do nothing.
 *
 * Because moved and vacated dates supersede the existing row in place, applying
 * an amended order updates the timetable rather than laying a second parallel
 * set of dates beside it.
 */
export async function applyDirections(
  input: ApplyDirectionsInput,
  actor: string | null,
): Promise<ApplyDirectionsResult> {
  const db = getDb();
  const now = new Date();
  const created: string[] = [];
  const superseded: string[] = [];
  const counts = { new: 0, moved: 0, superseded: 0, unchanged: 0 };

  await db.transaction(async (tx) => {
    for (const row of input.rows) {
      if (!row.include || row.class === 'unchanged') continue;

      const insertNew = async (): Promise<string> => {
        if (!row.date) {
          throw new Error(`row for ${row.type} is missing a date`);
        }
        const [inserted] = await tx
          .insert(keyDates)
          .values({
            caseId: input.caseId,
            date: row.date,
            time: row.time,
            title: row.title,
            description: row.obligation,
            type: row.type,
            source: 'directions_order',
            confidence:
              row.confidence === undefined
                ? null
                : confidenceBucket(row.confidence),
            sourceDocumentId: input.sourceDocumentId,
            sourceReference: row.sourceReference,
          })
          .returning({ id: keyDates.id });
        return inserted!.id;
      };

      const supersedeExisting = async (
        id: string,
        successorId: string | null,
      ): Promise<void> => {
        await tx
          .update(keyDates)
          .set({
            supersededAt: now,
            supersededById: successorId,
            updatedAt: now,
          })
          .where(eq(keyDates.id, id));
      };

      if (row.class === 'new') {
        created.push(await insertNew());
        counts.new += 1;
      } else if (row.class === 'moved') {
        if (!row.existingKeyDateId) {
          throw new Error('moved row is missing the existing key date id');
        }
        const newId = await insertNew();
        await supersedeExisting(row.existingKeyDateId, newId);
        created.push(newId);
        superseded.push(row.existingKeyDateId);
        counts.moved += 1;
      } else if (row.class === 'superseded') {
        if (!row.existingKeyDateId) {
          throw new Error('superseded row is missing the existing key date id');
        }
        await supersedeExisting(row.existingKeyDateId, null);
        superseded.push(row.existingKeyDateId);
        counts.superseded += 1;
      }
    }

    // ONE audit entry for the whole apply — identifiers and counts, no personal
    // data. It records which order drove the change and what it did.
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'key_date.apply_directions',
      entityType: 'case',
      entityId: input.caseId,
      after: {
        sourceDocumentId: input.sourceDocumentId,
        counts,
        created,
        superseded,
      },
    });
  });

  return { created, superseded, counts };
}
