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
import {
  DIRECTIONS_CATEGORY_KEY_DATE_TYPE,
  DIRECTIONS_CATEGORY_VALUES,
  type DirectionsCategory,
  type KeyDateType,
} from './config';
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
// Every field is guarded with `.catch`/`.default`, so a single malformed or
// omitted field — a capitalised party, a date like "2026-6-8", a time like
// "4pm", a missing boolean — falls back to a safe value instead of failing the
// whole order. The field descriptions still guide the model (they are emitted
// in the tool schema); this only rescues the exceptions. A deadline that is not
// a clean ISO date becomes null and is recomputed downstream from rawDateText.
export const ExtractedDirectionSchema = z.object({
  obligation: z
    .string()
    .describe('The obligation in full, as written in the order.')
    .catch('')
    .default(''),
  party: DirectionPartySchema.describe(
    'Who the obligation falls on: appellant, respondent, both, or tribunal.',
  )
    .catch('respondent')
    .default('respondent'),
  category: z
    .enum(DIRECTIONS_CATEGORY_VALUES)
    .describe(
      'The tribunal directions category this obligation sets, one of: ' +
        '"LA response to the Appeal" (the LA/respondent filing its response to ' +
        'the appeal), "Final Evidence Deadline" (the deadline to file/serve ' +
        'final evidence), "Case Review Form" (filing the case review form), ' +
        '"Final Tribunal Bundle" (the final hearing bundle), "Case Management ' +
        'Review" (a case management review/telephone case management hearing), ' +
        '"Final Hearing" (the final hearing itself), or "Other" if it is none ' +
        'of these.',
    )
    .catch('Other')
    .default('Other'),
  deadlineDate: z
    .string()
    .nullable()
    .describe(
      'The deadline as an absolute date exactly as written (prefer YYYY-MM-DD; ' +
        'UK day/month/year like 27/03/2026 is accepted), or null if the ' +
        'obligation vacates/removes a date rather than setting one.',
    )
    .catch(null)
    .default(null),
  deadlineTime: z
    .string()
    .nullable()
    .describe(
      'Time of day if given (e.g. "16:00", "12 noon", "4pm"), else null.',
    )
    .catch(null)
    .default(null),
  rawDateText: z
    .string()
    .describe('The deadline exactly as written, e.g. "within 14 days".')
    .catch('')
    .default(''),
  workingDays: z
    .boolean()
    .describe('True if the original deadline was expressed in working days.')
    .catch(false)
    .default(false),
  vacated: z
    .boolean()
    .describe('True if this obligation vacates/removes an existing date.')
    .catch(false)
    .default(false),
  paragraph: z
    .number()
    .int()
    .nullable()
    .describe('The source paragraph number in the order, or null.')
    .catch(null)
    .default(null),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('0..1 confidence in this extraction.')
    .catch(0.5)
    .default(0.5),
});
export type ExtractedDirection = z.infer<typeof ExtractedDirectionSchema>;

/**
 * Fallback for an array element that is not even a usable object. It has an
 * empty obligation, so it is dropped by the filter below and never reaches the
 * diff — one broken obligation cannot fail the whole order.
 */
const EMPTY_DIRECTION: ExtractedDirection = {
  obligation: '',
  party: 'respondent',
  category: 'Other',
  deadlineDate: null,
  deadlineTime: null,
  rawDateText: '',
  workingDays: false,
  vacated: false,
  paragraph: null,
  confidence: 0,
};

export const ExtractDirectionsOutputSchema = z.object({
  orderDate: z
    .string()
    .nullable()
    .describe(
      'The date the order itself was made, exactly as written (any format), ' +
        'or null.',
    )
    .catch(null)
    .default(null),
  directions: z
    .array(ExtractedDirectionSchema.catch(EMPTY_DIRECTION))
    .catch([])
    .default([])
    // Drop empty/unusable obligations (including the fallback above) so a single
    // broken entry can't fail the order, and junk rows never reach the diff.
    .transform((arr) => arr.filter((d) => d.obligation.trim() !== '')),
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
  /** The tribunal directions category, e.g. "Final Hearing". */
  category: DirectionsCategory;
  /** A short label for the key date — the category, or (for "Other") the obligation. */
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

/**
 * A short, human title for a direction. For a named category the title IS the
 * category (so it reads as the order does, and so a later order's same-category
 * date matches this one). "Other" has no standard label, so it falls back to
 * the opening words of the obligation.
 */
function titleFor(d: ExtractedDirection): string {
  if (d.category !== 'Other') return d.category;
  const words = d.obligation.trim().split(/\s+/).slice(0, 6).join(' ');
  return words || 'Direction';
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
const MONTHS: Record<string, string> = {
  january: '01',
  jan: '01',
  february: '02',
  feb: '02',
  march: '03',
  mar: '03',
  april: '04',
  apr: '04',
  may: '05',
  june: '06',
  jun: '06',
  july: '07',
  jul: '07',
  august: '08',
  aug: '08',
  september: '09',
  sep: '09',
  sept: '09',
  october: '10',
  oct: '10',
  november: '11',
  nov: '11',
  december: '12',
  dec: '12',
};

/**
 * Normalise a date as the model read it into ISO YYYY-MM-DD, or null. These are
 * English SEND tribunal orders, so an ambiguous numeric date is read as UK
 * day/month/year (27/03/2026 → 2026-03-27). Handles ISO, DD/MM/YYYY (with / . or
 * - separators) and "27 March 2026" / "27th March 2026". Returns null when no
 * date can be read, so the caller can fall back to the raw text.
 */
export function normaliseIsoDate(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const s = input.trim();
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${dmy[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const named = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?\s+(\d{4})/);
  if (named) {
    const month = MONTHS[named[2]!.toLowerCase()];
    if (month) {
      return `${named[3]}-${month}-${String(Number(named[1])).padStart(2, '0')}`;
    }
  }
  return null;
}

/**
 * Normalise a time as the model read it into HH:MM, or null. Handles HH:MM,
 * "12 noon"/"noon", "midnight" and am/pm ("4pm" → "16:00").
 */
export function normaliseTime(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  const hm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) return `${hm[1]!.padStart(2, '0')}:${hm[2]}`;
  if (s.includes('noon')) return '12:00';
  if (s.includes('midnight')) return '00:00';
  const ampm = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  if (ampm) {
    let h = Number(ampm[1]);
    if (ampm[3] === 'pm' && h < 12) h += 12;
    if (ampm[3] === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${ampm[2] ?? '00'}`;
  }
  const embedded = s.match(/(\d{1,2}):(\d{2})/);
  if (embedded) return `${embedded[1]!.padStart(2, '0')}:${embedded[2]}`;
  return null;
}

export function resolveDirections(
  output: ExtractDirectionsOutput,
  holidays: Holidays,
): ResolvedDirection[] {
  const orderDate = normaliseIsoDate(output.orderDate);
  const hearingDate =
    output.directions
      .map((d) =>
        d.category === 'Final Hearing'
          ? (normaliseIsoDate(d.deadlineDate) ??
            normaliseIsoDate(d.rawDateText))
          : null,
      )
      .find((d) => d !== null) ?? null;
  const anchors = { order_date: orderDate, hearing: hearingDate };

  return output.directions.map((d) => {
    // The absolute date the model read, normalised from UK/other formats, with
    // a fallback to a date embedded in the raw text ("12 noon on 27/03/2026").
    let date =
      normaliseIsoDate(d.deadlineDate) ?? normaliseIsoDate(d.rawDateText);
    let time = normaliseTime(d.deadlineTime);
    let explanation: string | null = null;

    if (!d.vacated) {
      // A relative deadline ("within 14 days of the order") is recomputed
      // authoritatively; an absolute date is kept as normalised above.
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
      category: d.category,
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
  category: DirectionsCategory;
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

/** Case-insensitive equality of two key-date titles. */
function sameTitle(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Find the existing key date a resolved direction updates: the one with the
 * same title — which, for the standard categories, IS the category, so a later
 * order's "Final Hearing" pairs with the existing "Final Hearing" and is
 * proposed as a move rather than a duplicate. When several share the title, the
 * closest by obligation text wins. Already-matched key dates are excluded so two
 * directions never claim the same existing date.
 */
function findMatch(
  resolved: ResolvedDirection,
  existing: KeyDateFull[],
  taken: Set<string>,
): KeyDateFull | null {
  const candidates = existing.filter(
    (k) => sameTitle(k.title, resolved.title) && !taken.has(k.id),
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;
  let best = candidates[0]!;
  let bestScore = similarity(resolved.obligation, best.title);
  for (const c of candidates.slice(1)) {
    const score = similarity(resolved.obligation, c.title);
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
      category: d.category,
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
  category: DirectionsCategory;
  /** The key-date type the category maps to, stored for the calendar colour. */
  type: KeyDateType;
  obligation: string;
  sourceReference: string | null;
}

/** The key-date type a directions category is stored as (for calendar colour). */
export function keyDateTypeForCategory(
  category: DirectionsCategory,
): KeyDateType {
  return DIRECTIONS_CATEGORY_KEY_DATE_TYPE[category];
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
    category: row.category,
    type: keyDateTypeForCategory(row.category),
    obligation: row.obligation,
    sourceReference: sourceReference(row.paragraph),
  };
}
