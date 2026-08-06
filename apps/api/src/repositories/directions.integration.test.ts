import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  diffDirections,
  diffRowToApplyRow,
  type ResolvedDirection,
} from '@re-send/shared';
import { getDb } from '../db/client';
import { createCase } from './create-case';
import { applyDirections, liveKeyDates } from './directions';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

/** Map a diff into apply rows, carrying confidence through. */
function toApplyRows(diff: ReturnType<typeof diffDirections>) {
  return diff.rows.map((r) => ({
    ...diffRowToApplyRow(r),
    confidence: r.confidence,
  }));
}

async function seedCase(actor: string): Promise<string> {
  const { caseId } = await createCase(
    {
      client: { fullName: 'Test Parent', consentDataProcessing: true },
      child: { fullName: 'Test Child', dateOfBirth: '2015-01-01' },
      case: { currentWork: 'Section Appeal', appealLodged: true },
    },
    actor,
  );
  return caseId;
}

run(
  'directions ingestion — amended order updates the timetable in place',
  () => {
    it('moves the evidence deadline and vacates the hearing with no duplicates', async () => {
      const db = getDb();
      const [user] = (await db.execute(
        sql`SELECT id FROM users LIMIT 1`,
      )) as unknown as { id: string }[];
      const actor = user!.id;
      const caseId = await seedCase(actor);

      // --- Initial order: sets a hearing and an evidence deadline. ------------
      const initial: ResolvedDirection[] = [
        {
          obligation: 'The final hearing is listed for 18 June 2026.',
          party: 'tribunal',
          type: 'hearing',
          title: 'Final hearing',
          date: '2026-06-18',
          time: '10:00',
          rawDateText: '18 June 2026',
          workingDays: false,
          vacated: false,
          paragraph: 1,
          confidence: 0.95,
          explanation: null,
        },
        {
          obligation:
            'The appellant shall file and serve evidence within 14 days of the date of this order.',
          party: 'appellant',
          type: 'evidence_deadline',
          title: 'Evidence deadline',
          date: '2026-05-01',
          time: '16:00',
          rawDateText: 'within 14 days of the date of this order',
          workingDays: false,
          vacated: false,
          paragraph: 2,
          confidence: 0.9,
          explanation:
            '14 calendar days after the date of this order = 2026-05-01',
        },
      ];

      const initialDiff = diffDirections(await liveKeyDates(caseId), initial);
      expect(initialDiff.counts).toEqual({
        new: 2,
        moved: 0,
        superseded: 0,
        unchanged: 0,
      });
      expect(initialDiff.summary).toBe('2 new dates');
      await applyDirections(
        { caseId, sourceDocumentId: null, rows: toApplyRows(initialDiff) },
        actor,
      );

      const afterInitial = await liveKeyDates(caseId);
      expect(afterInitial).toHaveLength(2);
      const hearing = afterInitial.find((k) => k.type === 'hearing')!;
      const evidence = afterInitial.find(
        (k) => k.type === 'evidence_deadline',
      )!;
      expect(hearing.date).toBe('2026-06-18');
      expect(evidence.date).toBe('2026-05-01');
      expect(evidence.source).toBe('directions_order');

      // --- Amended order: moves the evidence deadline, vacates the hearing. ----
      const amended: ResolvedDirection[] = [
        {
          obligation:
            'The appellant shall file and serve evidence within 21 days of the date of this order.',
          party: 'appellant',
          type: 'evidence_deadline',
          title: 'Evidence deadline',
          date: '2026-05-15',
          time: '16:00',
          rawDateText: 'within 21 days of the date of this order',
          workingDays: false,
          vacated: false,
          paragraph: 1,
          confidence: 0.9,
          explanation: null,
        },
        {
          obligation: 'The hearing listed for 18 June 2026 is vacated.',
          party: 'tribunal',
          type: 'hearing',
          title: 'Final hearing',
          date: null,
          time: null,
          rawDateText: 'vacated',
          workingDays: false,
          vacated: true,
          paragraph: 2,
          confidence: 0.92,
          explanation: null,
        },
      ];

      const amendedDiff = diffDirections(afterInitial, amended);
      // The evidence deadline is recognised as the same date, moved — not new.
      expect(amendedDiff.counts).toEqual({
        new: 0,
        moved: 1,
        superseded: 1,
        unchanged: 0,
      });
      expect(amendedDiff.summary).toBe('1 date moved, 1 removed');
      await applyDirections(
        { caseId, sourceDocumentId: null, rows: toApplyRows(amendedDiff) },
        actor,
      );

      // --- The calendar ends up correct, with no duplicates. ------------------
      const finalDates = await liveKeyDates(caseId);
      expect(finalDates).toHaveLength(1);
      expect(finalDates[0]!.type).toBe('evidence_deadline');
      expect(finalDates[0]!.date).toBe('2026-05-15');

      // No two live evidence deadlines — the amended order updated, not parallelled.
      expect(
        finalDates.filter((k) => k.type === 'evidence_deadline'),
      ).toHaveLength(1);
      // The hearing is gone from the calendar.
      expect(finalDates.some((k) => k.type === 'hearing')).toBe(false);

      // Superseded rows are marked, never deleted, so history is preserved.
      const all = (await db.execute(
        sql`SELECT type, date, superseded_at, superseded_by_id, deleted_at
          FROM key_dates WHERE case_id = ${caseId} ORDER BY created_at`,
      )) as unknown as {
        type: string;
        date: string;
        superseded_at: string | null;
        superseded_by_id: string | null;
        deleted_at: string | null;
      }[];
      // 3 rows total: original hearing (superseded), original evidence
      // (superseded, pointing at its successor), new evidence (live).
      expect(all).toHaveLength(3);
      expect(all.every((r) => r.deleted_at === null)).toBe(true);
      const supersededRows = all.filter((r) => r.superseded_at !== null);
      expect(supersededRows).toHaveLength(2);
      const movedOriginal = all.find(
        (r) => r.type === 'evidence_deadline' && r.superseded_at !== null,
      )!;
      expect(movedOriginal.superseded_by_id).not.toBeNull();
      const vacatedHearing = all.find((r) => r.type === 'hearing')!;
      expect(vacatedHearing.superseded_at).not.toBeNull();
      expect(vacatedHearing.superseded_by_id).toBeNull();

      // Exactly one audit entry per apply covered the whole set (two applies).
      const audits = (await db.execute(
        sql`SELECT count(*)::int AS n FROM audit_log
          WHERE action = 'key_date.apply_directions'
            AND entity_id = ${caseId}`,
      )) as unknown as { n: number }[];
      expect(audits[0]!.n).toBe(2);
    });
  },
);
