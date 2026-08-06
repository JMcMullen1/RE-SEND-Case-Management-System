import { describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  diffRowToApplyRow,
  snapshotHolidays,
  type ExtractDirectionsOutput,
} from '@re-send/shared';
import { getDb } from '../db/client';
import { createCase } from '../repositories/create-case';
import { applyDirections, liveKeyDates } from '../repositories/directions';
import type { MessagesClient } from './client';
import { runDirectionsExtraction } from './directions';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

/** A stubbed model returning a fixed directions extraction. */
function stubClient(output: ExtractDirectionsOutput): MessagesClient {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        id: 'm',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5',
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 't1',
            name: 'record_extract_directions',
            input: output,
          },
        ],
        usage: {
          input_tokens: 500,
          output_tokens: 120,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      }),
    },
  } as unknown as MessagesClient;
}

const deps = (output: ExtractDirectionsOutput) => ({
  today: '2026-04-01',
  loadHolidays: async () => ({
    holidays: snapshotHolidays(),
    source: 'snapshot' as const,
  }),
  jobOverrides: {
    client: stubClient(output),
    record: async () => {},
    getFlag: async () => null,
    globalEnabled: true,
  },
});

run('directions extraction pipeline', () => {
  it('stores the order, resolves deadlines and diffs, then applies without duplicates', async () => {
    const db = getDb();
    const [user] = (await db.execute(
      sql`SELECT id FROM users LIMIT 1`,
    )) as unknown as { id: string }[];
    const actor = user!.id;
    const { caseId } = await createCase(
      {
        client: { fullName: 'Test Parent', consentDataProcessing: true },
        child: { fullName: 'Test Child', dateOfBirth: '2015-01-01' },
        case: { currentWork: 'Section Appeal', appealLodged: true },
      },
      actor,
    );

    // --- Initial order ------------------------------------------------------
    const initial: ExtractDirectionsOutput = {
      orderDate: '2026-04-01',
      directions: [
        {
          obligation: 'The final hearing is listed for 8 June 2026 at 10am.',
          party: 'tribunal',
          type: 'hearing',
          deadlineDate: '2026-06-08',
          deadlineTime: '10:00',
          rawDateText: '8 June 2026',
          workingDays: false,
          vacated: false,
          paragraph: 1,
          confidence: 0.95,
        },
        {
          obligation:
            'The appellant shall file evidence no later than 4pm 10 working days before the hearing.',
          party: 'appellant',
          type: 'evidence_deadline',
          deadlineDate: '2026-05-25',
          deadlineTime: null,
          rawDateText: 'no later than 4pm 10 working days before the hearing',
          workingDays: true,
          vacated: false,
          paragraph: 2,
          confidence: 0.9,
        },
      ],
    };

    const review1 = await runDirectionsExtraction(
      {
        caseId,
        bytes: Buffer.from('1. Final hearing 8 June 2026.\n2. Evidence...'),
        filename: 'directions-order.txt',
        mimeType: 'text/plain',
      },
      actor,
      deps(initial),
    );

    // The order is stored as a Tribunal Order document.
    const docs = (await db.execute(
      sql`SELECT category FROM documents WHERE case_id = ${caseId}`,
    )) as unknown as { category: string }[];
    expect(docs).toHaveLength(1);
    expect(docs[0]!.category).toBe('Tribunal Order');

    // The working-day deadline is resolved authoritatively (over the Spring
    // bank holiday), and the explanation is carried into the review.
    const evidenceRow = review1.rows.find(
      (r) => r.type === 'evidence_deadline',
    )!;
    expect(evidenceRow.newValue!.date).toBe('2026-05-22');
    expect(evidenceRow.newValue!.time).toBe('16:00');
    expect(evidenceRow.explanation).toContain('Spring bank holiday');
    expect(review1.counts.new).toBe(2);
    expect(review1.summary).toBe('2 new dates');

    await applyDirections(
      {
        caseId,
        sourceDocumentId: review1.documentId,
        rows: review1.rows.map((r) => ({
          ...diffRowToApplyRow(r),
          confidence: r.confidence,
        })),
      },
      actor,
    );

    const afterInitial = await liveKeyDates(caseId);
    expect(afterInitial).toHaveLength(2);
    // Each key date is stamped with its source document and paragraph.
    const stamped = (await db.execute(
      sql`SELECT source, source_document_id, source_reference
          FROM key_dates WHERE case_id = ${caseId} AND superseded_at IS NULL`,
    )) as unknown as {
      source: string;
      source_document_id: string | null;
      source_reference: string | null;
    }[];
    expect(stamped.every((k) => k.source === 'directions_order')).toBe(true);
    expect(
      stamped.every((k) => k.source_document_id === review1.documentId),
    ).toBe(true);
    expect(stamped.some((k) => k.source_reference === 'Paragraph 1')).toBe(
      true,
    );

    // --- Amended order: move evidence, vacate the hearing -------------------
    const amended: ExtractDirectionsOutput = {
      orderDate: '2026-04-10',
      directions: [
        {
          obligation:
            'The appellant shall file evidence within 21 days of the date of this order.',
          party: 'appellant',
          type: 'evidence_deadline',
          deadlineDate: '2026-05-01',
          deadlineTime: '16:00',
          rawDateText: 'within 21 days of the date of this order',
          workingDays: false,
          vacated: false,
          paragraph: 1,
          confidence: 0.9,
        },
        {
          obligation: 'The hearing listed for 8 June 2026 is vacated.',
          party: 'tribunal',
          type: 'hearing',
          deadlineDate: null,
          deadlineTime: null,
          rawDateText: 'vacated',
          workingDays: false,
          vacated: true,
          paragraph: 2,
          confidence: 0.92,
        },
      ],
    };

    const review2 = await runDirectionsExtraction(
      {
        caseId,
        bytes: Buffer.from('Amended directions. 1. Evidence within 21 days...'),
        filename: 'amended-order.txt',
        mimeType: 'text/plain',
      },
      actor,
      deps(amended),
    );
    expect(review2.counts).toMatchObject({ moved: 1, superseded: 1 });

    await applyDirections(
      {
        caseId,
        sourceDocumentId: review2.documentId,
        rows: review2.rows.map((r) => ({
          ...diffRowToApplyRow(r),
          confidence: r.confidence,
        })),
      },
      actor,
    );

    // The calendar is correct and free of duplicates.
    const finalDates = await liveKeyDates(caseId);
    expect(finalDates).toHaveLength(1);
    expect(finalDates[0]!.type).toBe('evidence_deadline');
    // 21 calendar days after the amended order date 2026-04-10.
    expect(finalDates[0]!.date).toBe('2026-05-01');
    expect(finalDates.some((k) => k.type === 'hearing')).toBe(false);
  });
});
