import { describe, expect, it } from 'vitest';
import type { KeyDateFull } from './case-detail';
import {
  diffDirections,
  diffRowToApplyRow,
  ExtractDirectionsOutputSchema,
  resolveDirections,
  summariseDiff,
  type ExtractDirectionsOutput,
  type ResolvedDirection,
} from './directions';
import { snapshotHolidays } from './working-days';

function existing(partial: Partial<KeyDateFull>): KeyDateFull {
  return {
    id: partial.id ?? 'k1',
    date: partial.date ?? '2026-06-18',
    time: partial.time ?? null,
    title: partial.title ?? 'Final hearing',
    description: partial.description ?? null,
    type: partial.type ?? 'hearing',
    source: partial.source ?? 'directions_order',
    confidence: partial.confidence ?? 'high',
    sourceReference: partial.sourceReference ?? null,
  };
}

function resolved(partial: Partial<ResolvedDirection>): ResolvedDirection {
  return {
    obligation: partial.obligation ?? 'An obligation.',
    party: partial.party ?? 'appellant',
    type: partial.type ?? 'evidence_deadline',
    title: partial.title ?? 'Evidence deadline',
    date: partial.date ?? '2026-05-01',
    time: partial.time ?? null,
    rawDateText: partial.rawDateText ?? 'within 14 days',
    workingDays: partial.workingDays ?? false,
    vacated: partial.vacated ?? false,
    paragraph: partial.paragraph === undefined ? 1 : partial.paragraph,
    confidence: partial.confidence ?? 0.9,
    explanation: partial.explanation ?? null,
  };
}

describe('diffDirections', () => {
  it('classifies unmatched dates as new', () => {
    const diff = diffDirections(
      [],
      [resolved({}), resolved({ type: 'hearing' })],
    );
    expect(diff.counts.new).toBe(2);
    expect(diff.rows.every((r) => r.class === 'new')).toBe(true);
    expect(diff.rows.every((r) => r.oldValue === null)).toBe(true);
    expect(diff.rows.every((r) => r.include)).toBe(true);
  });

  it('classifies a same-date match as unchanged and defaults it off', () => {
    const diff = diffDirections(
      [existing({ id: 'e1', type: 'evidence_deadline', date: '2026-05-01' })],
      [resolved({ date: '2026-05-01' })],
    );
    expect(diff.counts.unchanged).toBe(1);
    expect(diff.rows[0]!.include).toBe(false);
  });

  it('classifies a changed date as moved, matched to the existing row', () => {
    const diff = diffDirections(
      [existing({ id: 'e1', type: 'evidence_deadline', date: '2026-05-01' })],
      [resolved({ date: '2026-05-15' })],
    );
    expect(diff.counts.moved).toBe(1);
    const row = diff.rows[0]!;
    expect(row.class).toBe('moved');
    expect(row.existingKeyDateId).toBe('e1');
    expect(row.oldValue!.date).toBe('2026-05-01');
    expect(row.newValue!.date).toBe('2026-05-15');
    expect(row.include).toBe(true);
  });

  it('treats a time-only change as moved', () => {
    const diff = diffDirections(
      [
        existing({
          id: 'e1',
          type: 'evidence_deadline',
          date: '2026-05-01',
          time: '16:00',
        }),
      ],
      [resolved({ date: '2026-05-01', time: '12:00' })],
    );
    expect(diff.counts.moved).toBe(1);
  });

  it('classifies a vacated obligation as superseded', () => {
    const diff = diffDirections(
      [existing({ id: 'h1', type: 'hearing', date: '2026-06-18' })],
      [resolved({ type: 'hearing', vacated: true, date: null })],
    );
    expect(diff.counts.superseded).toBe(1);
    const row = diff.rows[0]!;
    expect(row.existingKeyDateId).toBe('h1');
    expect(row.newValue).toBeNull();
    expect(row.oldValue!.date).toBe('2026-06-18');
  });

  it('drops a vacation that matches no existing date', () => {
    const diff = diffDirections(
      [],
      [resolved({ type: 'hearing', vacated: true, date: null })],
    );
    expect(diff.rows).toHaveLength(0);
  });

  it('leaves unmentioned existing dates untouched', () => {
    // An order that only moves the evidence deadline never mentions the
    // annual review — it must not appear in the diff at all.
    const diff = diffDirections(
      [
        existing({ id: 'e1', type: 'evidence_deadline', date: '2026-05-01' }),
        existing({ id: 'a1', type: 'annual_review', date: '2026-09-01' }),
      ],
      [resolved({ date: '2026-05-15' })],
    );
    expect(diff.rows).toHaveLength(1);
    expect(diff.rows[0]!.existingKeyDateId).toBe('e1');
  });

  it('disambiguates multiple same-type dates by title similarity', () => {
    const diff = diffDirections(
      [
        existing({
          id: 'ev-app',
          type: 'evidence_deadline',
          title: 'Appellant evidence',
          date: '2026-05-01',
        }),
        existing({
          id: 'ev-res',
          type: 'evidence_deadline',
          title: 'Respondent evidence',
          date: '2026-05-08',
        }),
      ],
      [
        resolved({
          type: 'evidence_deadline',
          title: 'Respondent evidence',
          date: '2026-05-20',
        }),
      ],
    );
    expect(diff.rows).toHaveLength(1);
    expect(diff.rows[0]!.existingKeyDateId).toBe('ev-res');
    expect(diff.rows[0]!.class).toBe('moved');
  });

  it('does not let two directions claim the same existing date', () => {
    const diff = diffDirections(
      [existing({ id: 'e1', type: 'evidence_deadline', date: '2026-05-01' })],
      [
        resolved({ type: 'evidence_deadline', date: '2026-05-15' }),
        resolved({ type: 'evidence_deadline', date: '2026-05-22' }),
      ],
    );
    // First moves the existing row; second finds nothing left to match → new.
    const classes = diff.rows.map((r) => r.class).sort();
    expect(classes).toEqual(['moved', 'new']);
  });
});

describe('summariseDiff', () => {
  it('reads like a plain sentence', () => {
    expect(
      summariseDiff({ new: 3, moved: 2, superseded: 1, unchanged: 0 }),
    ).toBe('3 new dates, 2 dates moved, 1 removed');
  });

  it('uses singular forms', () => {
    expect(
      summariseDiff({ new: 1, moved: 1, superseded: 1, unchanged: 0 }),
    ).toBe('1 new date, 1 date moved, 1 removed');
  });

  it('reports no changes when only unchanged rows exist', () => {
    expect(
      summariseDiff({ new: 0, moved: 0, superseded: 0, unchanged: 2 }),
    ).toContain('No changes');
  });
});

describe('resolveDirections', () => {
  const H = snapshotHolidays();

  it('recomputes a relative calendar deadline and carries the explanation', () => {
    const output: ExtractDirectionsOutput = {
      orderDate: '2026-04-01',
      directions: [
        {
          obligation:
            'The appellant shall file evidence within 14 days of the date of this order.',
          party: 'appellant',
          type: 'evidence_deadline',
          // Model's arithmetic is deliberately wrong — we recompute it.
          deadlineDate: '2026-04-20',
          deadlineTime: null,
          rawDateText: 'within 14 days of the date of this order',
          workingDays: false,
          vacated: false,
          paragraph: 2,
          confidence: 0.9,
        },
      ],
    };
    const [d] = resolveDirections(output, H);
    expect(d!.date).toBe('2026-04-15');
    expect(d!.explanation).toContain(
      '14 calendar days after the date of this order',
    );
  });

  it('recomputes working days before the hearing, over a bank holiday', () => {
    const output: ExtractDirectionsOutput = {
      orderDate: '2026-04-01',
      directions: [
        {
          obligation: 'The final hearing is listed for 8 June 2026.',
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
          paragraph: 3,
          confidence: 0.9,
        },
      ],
    };
    const resolved = resolveDirections(output, H);
    const evidence = resolved.find((d) => d.type === 'evidence_deadline')!;
    expect(evidence.date).toBe('2026-05-22');
    expect(evidence.time).toBe('16:00');
    expect(evidence.explanation).toContain('Spring bank holiday');
  });

  it('leaves a vacated direction with no date', () => {
    const output: ExtractDirectionsOutput = {
      orderDate: '2026-04-01',
      directions: [
        {
          obligation: 'The hearing listed for 8 June 2026 is vacated.',
          party: 'tribunal',
          type: 'hearing',
          deadlineDate: null,
          deadlineTime: null,
          rawDateText: 'vacated',
          workingDays: false,
          vacated: true,
          paragraph: 1,
          confidence: 0.92,
        },
      ],
    };
    const [d] = resolveDirections(output, H);
    expect(d!.date).toBeNull();
    expect(d!.vacated).toBe(true);
    expect(d!.title).toBe('Hearing');
  });
});

describe('diffRowToApplyRow', () => {
  it('carries the source reference from the paragraph number', () => {
    const diff = diffDirections([], [resolved({ paragraph: 4 })]);
    const applyRow = diffRowToApplyRow(diff.rows[0]!);
    expect(applyRow.sourceReference).toBe('Paragraph 4');
    expect(applyRow.date).toBe('2026-05-01');
    expect(applyRow.class).toBe('new');
  });

  it('has no source reference when the paragraph is unknown', () => {
    const diff = diffDirections([], [resolved({ paragraph: null })]);
    expect(diffRowToApplyRow(diff.rows[0]!).sourceReference).toBeNull();
  });
});

describe('ExtractDirectionsOutputSchema resilience', () => {
  it('keeps good obligations, rescues bad fields, and drops broken entries', () => {
    const raw = {
      orderDate: '2026-05-01',
      directions: [
        // A clean obligation, kept as-is.
        {
          obligation: 'File and serve evidence',
          party: 'respondent',
          type: 'evidence_deadline',
          deadlineDate: '2026-06-01',
          deadlineTime: '16:00',
          rawDateText: 'by 1 June 2026',
          workingDays: false,
          vacated: false,
          paragraph: 3,
          confidence: 0.9,
        },
        // A near-miss: capitalised party, "4pm" time, non-ISO date. These are
        // rescued to safe values, and the obligation is still kept.
        {
          obligation: 'Attend the hearing',
          party: 'Appellant',
          type: 'court-hearing',
          deadlineDate: '2026-6-8',
          deadlineTime: '4pm',
          rawDateText: '8 June 2026',
          workingDays: 'no',
          vacated: false,
          paragraph: null,
          confidence: 1.4,
        },
        // Not even an object — dropped entirely.
        'nonsense',
      ],
    };
    const parsed = ExtractDirectionsOutputSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.orderDate).toBe('2026-05-01');
      // The two real obligations survive; the 'nonsense' element is dropped.
      expect(parsed.data.directions).toHaveLength(2);
      const bad = parsed.data.directions[1]!;
      expect(bad.obligation).toBe('Attend the hearing');
      expect(bad.party).toBe('respondent'); // invalid 'Appellant' -> fallback
      expect(bad.type).toBe('other'); // invalid 'court-hearing' -> fallback
      expect(bad.deadlineDate).toBeNull(); // non-ISO -> null
      expect(bad.deadlineTime).toBeNull(); // "4pm" -> null
      expect(bad.workingDays).toBe(false); // "no" -> false
      expect(bad.confidence).toBe(0.5); // out of range -> 0.5
    }
  });
});
