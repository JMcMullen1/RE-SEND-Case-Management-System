/**
 * directions.ts — types and pure logic for directions-order ingestion.
 *
 * A directions order sets a timetable: numbered obligations, each with a
 * deadline. Ingestion extracts those obligations, resolves any relative
 * deadline to an absolute date (via the working-day utility), then *diffs* the
 * proposed dates against the case's existing key dates. The diff is the heart
 * of the feature: an amended order must UPDATE the timetable, never lay a second
 * parallel set of dates beside it. Nothing here touches a database — the diff is
 * a pure function so it can be tested, and applied, without the AI layer.
 */

import { z } from 'zod';
import type { KeyDateFull } from './case-detail';
import { KEY_DATE_TYPE_VALUES, type KeyDateType } from './config';
import {
  parseDeadlineExpression,
  resolveDeadline,
  type Holidays,
} from './working-days';

// --- Who an obligation falls on ---------------------------------------------

export const DIRECTION_PARTY_VALUES = [
  'appellant',
  'respondent',
  'both',
  'tribunal',
] as const;
export type DirectionParty = (typeof DIRECTION_PARTY_VALUES)[number];
export const DirectionPartySchema = z.enum(DIRECTION_PARTY_VALUES);

// --- The AI extraction shape ------------------------------------------------

/**
 * One obligation as extracted from the order text. The model returns the
 * deadline as an absolute date *and* the raw date text as written, so a
 * caseworker can check the reading, plus the source paragraph number because
 * directions are referred to by number.
 */
export const ExtractedDirectionSchema = z.object({
  obligation: z
    .string()
    .describe('The obligation in full, as written in the order.'),
  party: DirectionPartySchema.describe(
    'Who the obligation falls on: appellant, respondent, both, or tribunal.',
  ),
  type: z
    .enum(KEY_DATE_TYPE_VALUES)
    .describe('The kind of key date this obligation sets.'),
  deadlineDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .describe(
      'The deadline as an absolute YYYY-MM-DD date, or null if the obligation ' +
        'vacates/removes a date rather than setting one.',
    ),
  deadlineTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .describe('Time of day if the order gives one (e.g. "16:00"), else null.'),
  rawDateText: z
    .string()
    .describe('The deadline exactly as written, e.g. "within 14 days".'),
  workingDays: z
    .boolean()
    .describe('True if the original deadline was expressed in working days.'),
  vacated: z
    .boolean()
    .describe('True if this obligation vacates/removes an existing date.'),
  paragraph: z
    .number()
    .int()
    .nullable()
    .describe('The source paragraph number in the order, or null.'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('0..1 confidence in this extraction.'),
});
export type ExtractedDirection = z.infer<typeof ExtractedDirectionSchema>;

export const ExtractDirectionsOutputSchema = z.object({
  orderDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .describe('The date the order itself was made, as YYYY-MM-DD, or null.'),
  directions: z.array(ExtractedDirectionSchema),
});
export type ExtractDirectionsOutput = z.infer<
  typeof ExtractDirectionsOutputSchema
>;

// --- A resolved direction (post working-day resolution) ---------------------

/**
 * An extracted direction after relative deadlines have been resolved to
 * absolute dates. `explanation` carries the working-day arithmetic through to
 * the review screen so a caseworker can check it. This is the input to the diff
 * — the test builds these by hand, without the AI.
 */
export interface ResolvedDirection {
  obligation: string;
  party: DirectionParty;
  type: KeyDateType;
  /** A short label for the key date, e.g. "Evidence deadline". */
  title: string;
  /** Absolute date, or null when the obligation vacates an existing date. */
  date: string | null;
  time: string | null;
  rawDateText: string;
  workingDays: boolean;
  vacated: boolean;
  paragraph: number | null;
  confidence: number;
  /** The deadline arithmetic explanation, when the deadline was relative. */
  explanation: string | null;
}

// --- Resolution (relative deadlines → absolute dates) -----------------------

const TYPE_LABEL: Record<KeyDateType, string> = {
  hearing: 'Hearing',
  evidence_deadline: 'Evidence deadline',
  annual_review: 'Annual review',
  working_document: 'Working document',
  mediation: 'Mediation',
  consultation: 'Consultation',
  other: 'Direction',
};

/** A short, human title for a direction, from its type (or its obligation). */
function titleFor(d: ExtractedDirection): string {
  if (d.type !== 'other') return TYPE_LABEL[d.type];
  const words = d.obligation.trim().split(/\s+/).slice(0, 6).join(' ');
  return words || TYPE_LABEL.other;
}

/**
 * Resolve extracted directions into absolute-dated directions.
 *
 * When a deadline was written relatively ("within 14 days of the order", "10
 * working days before the hearing"), it is recomputed with the working-day
 * utility rather than trusting the model's arithmetic — and the resulting
 * explanation is carried through so a caseworker can check it. The order date is
 * the extracted order date; the hearing anchor is any extracted hearing date.
 * Absolute deadlines the model read directly are kept as written.
 */
export function resolveDirections(
  output: ExtractDirectionsOutput,
  holidays: Holidays,
): ResolvedDirection[] {
  const hearingDate =
    output.directions.find((d) => d.type === 'hearing' && d.deadlineDate)
      ?.deadlineDate ?? null;
  const anchors = { order_date: output.orderDate, hearing: hearingDate };

  return output.directions.map((d) => {
    let date = d.deadlineDate;
    let time = d.deadlineTime;
    let explanation: string | null = null;

    if (!d.vacated && d.deadlineDate !== null) {
      const spec = parseDeadlineExpression(d.rawDateText);
      if (spec) {
        const resolved = resolveDeadline(
          { ...spec, unit: d.workingDays ? 'working' : spec.unit },
          anchors,
          holidays,
        );
        if (resolved) {
          date = resolved.date;
          time = resolved.time ?? time;
          explanation = resolved.explanation;
        }
      }
    }

    return {
      obligation: d.obligation,
      party: d.party,
      type: d.type,
      title: titleFor(d),
      date: d.vacated ? null : date,
      time: d.vacated ? null : time,
      rawDateText: d.rawDateText,
      workingDays: d.workingDays,
      vacated: d.vacated,
      paragraph: d.paragraph,
      confidence: d.confidence,
      explanation,
    };
  });
}

// --- The diff ---------------------------------------------------------------

export type DiffClass = 'new' | 'moved' | 'superseded' | 'unchanged';

/**
 * One row of the diff: a proposed change classified against the existing key
 * dates. It carries everything the review screen needs — the old and new value
 * side by side, the source paragraph to quote — and everything apply needs: the
 * matched existing key date id and the resolved values. Rows are editable and
 * individually includable before apply.
 */
export interface DirectionDiffRow {
  class: DiffClass;
  /** The matched existing key date, when this row changes or leaves one. */
  existingKeyDateId: string | null;
  /** The existing value, for the side-by-side view (null for a brand-new date). */
  oldValue: { date: string; time: string | null; title: string } | null;
  /** The proposed value (null when the row only removes an existing date). */
  newValue: { date: string; time: string | null; title: string } | null;
  type: KeyDateType;
  party: DirectionParty;
  /** Full obligation text, quoted beside the row. */
  obligation: string;
  rawDateText: string;
  workingDays: boolean;
  explanation: string | null;
  paragraph: number | null;
  confidence: number;
  /** Default include: unchanged rows default off, everything else on. */
  include: boolean;
}

export interface DirectionsDiff {
  rows: DirectionDiffRow[];
  summary: string;
  counts: Record<DiffClass, number>;
}

function sourceReference(paragraph: number | null): string | null {
  return paragraph === null ? null : `Paragraph ${paragraph}`;
}

/** Normalise a title to word tokens for similarity matching. */
function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );
}

/** Jaccard token overlap, used only to disambiguate multiple same-type dates. */
function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / (ta.size + tb.size - shared);
}

/**
 * Find the best existing key date for a resolved direction: same type, and —
 * when several share that type — the closest by title. Already-matched key
 * dates are excluded so two directions never claim the same existing date.
 */
function findMatch(
  resolved: ResolvedDirection,
  existing: KeyDateFull[],
  taken: Set<string>,
): KeyDateFull | null {
  const candidates = existing.filter(
    (k) => k.type === resolved.type && !taken.has(k.id),
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;
  let best = candidates[0]!;
  let bestScore = similarity(resolved.title, best.title);
  for (const c of candidates.slice(1)) {
    const score = similarity(resolved.title, c.title);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Diff resolved directions against the case's existing (live) key dates.
 *
 * - a direction that removes/vacates a date it matches → **superseded**
 * - a direction matching an existing date, same date and time → **unchanged**
 * - a direction matching an existing date, different date/time → **moved**
 * - a direction matching nothing → **new**
 *
 * Existing key dates a direction never mentions are left untouched — only
 * explicitly vacated or matched-and-moved dates are superseded on apply, so the
 * timetable is updated in place rather than duplicated.
 */
export function diffDirections(
  existing: KeyDateFull[],
  resolved: ResolvedDirection[],
): DirectionsDiff {
  const rows: DirectionDiffRow[] = [];
  const taken = new Set<string>();

  for (const d of resolved) {
    const match = findMatch(d, existing, taken);
    if (match) taken.add(match.id);

    const base = {
      type: d.type,
      party: d.party,
      obligation: d.obligation,
      rawDateText: d.rawDateText,
      workingDays: d.workingDays,
      explanation: d.explanation,
      paragraph: d.paragraph,
      confidence: d.confidence,
    };

    if (d.vacated || d.date === null) {
      // Removes a date. Only meaningful if it matches an existing one.
      if (!match) continue;
      rows.push({
        ...base,
        class: 'superseded',
        existingKeyDateId: match.id,
        oldValue: { date: match.date, time: match.time, title: match.title },
        newValue: null,
        include: true,
      });
      continue;
    }

    const newValue = { date: d.date, time: d.time, title: d.title };
    if (!match) {
      rows.push({
        ...base,
        class: 'new',
        existingKeyDateId: null,
        oldValue: null,
        newValue,
        include: true,
      });
      continue;
    }

    const unchanged = match.date === d.date && match.time === d.time;
    rows.push({
      ...base,
      class: unchanged ? 'unchanged' : 'moved',
      existingKeyDateId: match.id,
      oldValue: { date: match.date, time: match.time, title: match.title },
      newValue,
      include: !unchanged,
    });
  }

  const counts: Record<DiffClass, number> = {
    new: 0,
    moved: 0,
    superseded: 0,
    unchanged: 0,
  };
  for (const r of rows) counts[r.class] += 1;

  return { rows, summary: summariseDiff(counts), counts };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A plain-English summary like "3 new dates, 2 dates moved, 1 removed". */
export function summariseDiff(counts: Record<DiffClass, number>): string {
  const parts: string[] = [];
  if (counts.new) parts.push(plural(counts.new, 'new date', 'new dates'));
  if (counts.moved)
    parts.push(plural(counts.moved, 'date moved', 'dates moved'));
  if (counts.superseded) parts.push(`${counts.superseded} removed`);
  if (parts.length === 0) {
    return counts.unchanged
      ? 'No changes — the timetable already matches this order'
      : 'No dates found';
  }
  return parts.join(', ');
}

// --- The review a caseworker confirms ---------------------------------------

/**
 * Everything the review screen needs: the stored order document, its date, the
 * plain summary, and the diff rows. Nothing here has touched the calendar — the
 * caseworker edits and includes rows, then applies.
 */
export interface DirectionsReview {
  documentId: string;
  filename: string;
  orderDate: string | null;
  summary: string;
  counts: Record<DiffClass, number>;
  rows: DirectionDiffRow[];
}

/**
 * The extract endpoint's response. Like smart fill, the feature can be switched
 * off (globally or per job) or fail; each is a clean, typed outcome so the case
 * screen degrades gracefully rather than breaking.
 */
export type DirectionsResponse =
  | { status: 'ok'; review: DirectionsReview }
  | { status: 'disabled' }
  | { status: 'refused' }
  | { status: 'error'; message: string };

/** The outcome of applying a reviewed set of directions. */
export interface DirectionsApplyResult {
  created: number;
  superseded: number;
  summary: string;
}

// --- Apply payload ----------------------------------------------------------

/**
 * A decided row, ready to apply. The review screen turns diff rows into these:
 * values may have been edited, and `include` may have been toggled. Apply writes
 * only included rows, in one transaction, under one audit entry.
 */
export interface DirectionApplyRow {
  class: DiffClass;
  include: boolean;
  existingKeyDateId: string | null;
  date: string | null;
  time: string | null;
  title: string;
  type: KeyDateType;
  obligation: string;
  sourceReference: string | null;
}

/** Turn a diff row into its default apply row (source reference from paragraph). */
export function diffRowToApplyRow(row: DirectionDiffRow): DirectionApplyRow {
  return {
    class: row.class,
    include: row.include,
    existingKeyDateId: row.existingKeyDateId,
    date: row.newValue?.date ?? null,
    time: row.newValue?.time ?? null,
    title: row.newValue?.title ?? row.oldValue?.title ?? row.obligation,
    type: row.type,
    obligation: row.obligation,
    sourceReference: sourceReference(row.paragraph),
  };
}
