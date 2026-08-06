/**
 * working-days.ts — UK (England & Wales) working-day arithmetic for deadlines.
 *
 * Every function returns a human-readable explanation alongside its result, so a
 * caseworker can check the arithmetic rather than trust it. Bank holidays come
 * from the GOV.UK feed (cached), with a checked-in snapshot as a fallback so an
 * outage can never break a deadline calculation.
 */

import {
  BANK_HOLIDAYS_SNAPSHOT,
  type BankHolidayEvent,
} from './bank-holidays-snapshot';

export type { BankHolidayEvent };

export interface Holidays {
  has: (iso: string) => boolean;
  title: (iso: string) => string | undefined;
  count: number;
}

/** Build a Holidays lookup from a list of bank-holiday events. */
export function bankHolidays(events: readonly BankHolidayEvent[]): Holidays {
  const map = new Map(events.map((e) => [e.date, e.title]));
  return {
    has: (iso) => map.has(iso),
    title: (iso) => map.get(iso),
    count: map.size,
  };
}

/** The checked-in fallback set of England & Wales bank holidays. */
export function snapshotHolidays(): Holidays {
  return bankHolidays(BANK_HOLIDAYS_SNAPSHOT);
}

// --- Bank-holiday loader (feed → cache → snapshot) --------------------------

const FEED_URL = 'https://www.gov.uk/bank-holidays.json';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

interface Cache {
  at: number;
  holidays: Holidays;
  source: 'feed' | 'snapshot';
}
let cache: Cache | undefined;

export interface LoadOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
}

/**
 * Load England & Wales bank holidays, preferring the live GOV.UK feed and
 * caching the result. On any failure it falls back to the checked-in snapshot,
 * so deadline calculation keeps working through a feed outage.
 */
export async function loadBankHolidays(
  opts: LoadOptions = {},
): Promise<{ holidays: Holidays; source: 'feed' | 'snapshot' }> {
  const now = opts.now ? opts.now() : Date.now();
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  if (cache && now - cache.at < ttl) {
    return { holidays: cache.holidays, source: cache.source };
  }
  try {
    const doFetch = opts.fetchImpl ?? fetch;
    const res = await doFetch(FEED_URL);
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const data = (await res.json()) as {
      'england-and-wales': { events: BankHolidayEvent[] };
    };
    const events = data['england-and-wales'].events.map((e) => ({
      date: e.date,
      title: e.title,
    }));
    const holidays = bankHolidays(events);
    cache = { at: now, holidays, source: 'feed' };
    return { holidays, source: 'feed' };
  } catch {
    const holidays = snapshotHolidays();
    // Cache the snapshot briefly so an outage doesn't hammer the feed.
    cache = { at: now, holidays, source: 'snapshot' };
    return { holidays, source: 'snapshot' };
  }
}

export function resetBankHolidayCache(): void {
  cache = undefined;
}

// --- Date helpers -----------------------------------------------------------

function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}
function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function shift(iso: string, days: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}
function dayOfWeek(iso: string): number {
  return toDate(iso).getUTCDay(); // 0 = Sunday, 6 = Saturday
}

/** True when a date is a weekday and not an England & Wales bank holiday. */
export function isWorkingDay(iso: string, holidays: Holidays): boolean {
  const dow = dayOfWeek(iso);
  return dow !== 0 && dow !== 6 && !holidays.has(iso);
}

function plural(n: number): string {
  return n === 1 ? '' : 's';
}

function holidayNote(skipped: string[]): string {
  if (skipped.length === 0) return '';
  return ` (skipping weekends and ${skipped.length} bank holiday${plural(
    skipped.length,
  )}: ${skipped.join(', ')})`;
}

export interface WorkingDayResult {
  date: string;
  explanation: string;
  skippedHolidays: string[];
}

/**
 * Add N working days to a date (negative N subtracts). Counts only weekdays that
 * are not bank holidays, starting from the day after `iso`.
 */
export function addWorkingDays(
  iso: string,
  n: number,
  holidays: Holidays,
): WorkingDayResult {
  const step = n >= 0 ? 1 : -1;
  let remaining = Math.abs(n);
  let cursor = iso;
  const skipped: string[] = [];
  while (remaining > 0) {
    cursor = shift(cursor, step);
    if (isWorkingDay(cursor, holidays)) {
      remaining -= 1;
    } else if (holidays.has(cursor)) {
      skipped.push(holidays.title(cursor) ?? cursor);
    }
  }
  const dir = n >= 0 ? 'after' : 'before';
  const explanation = `${Math.abs(n)} working day${plural(
    Math.abs(n),
  )} ${dir} ${iso}${holidayNote(skipped)} = ${cursor}`;
  return { date: cursor, explanation, skippedHolidays: skipped };
}

/** Add N calendar days to a date (negative N subtracts). */
export function addCalendarDays(
  iso: string,
  n: number,
): { date: string; explanation: string } {
  const date = shift(iso, n);
  const dir = n >= 0 ? 'after' : 'before';
  return {
    date,
    explanation: `${Math.abs(n)} calendar day${plural(
      Math.abs(n),
    )} ${dir} ${iso} = ${date}`,
  };
}

/**
 * Count working days between two dates (weekends and bank holidays excluded).
 * The count is of working days in the interval after the earlier date up to and
 * including the later one; negative when `to` precedes `from`.
 */
export function workingDaysBetween(
  from: string,
  to: string,
  holidays: Holidays,
): { days: number; explanation: string } {
  if (from === to) {
    return { days: 0, explanation: `${from} and ${to} are the same day` };
  }
  const forward = from < to;
  const start = forward ? from : to;
  const end = forward ? to : from;
  let cursor = start;
  let count = 0;
  while (cursor < end) {
    cursor = shift(cursor, 1);
    if (isWorkingDay(cursor, holidays)) count += 1;
  }
  const days = forward ? count : -count;
  return {
    days,
    explanation: `${count} working day${plural(
      count,
    )} between ${from} and ${to} (weekends and bank holidays excluded)`,
  };
}

// --- Deadline resolution ----------------------------------------------------

export interface DeadlineSpec {
  offset: number;
  unit: 'working' | 'calendar';
  direction: 'before' | 'after';
  anchor: 'order_date' | 'hearing';
  /** Optional time of day, e.g. "16:00" for "no later than 4pm". */
  time?: string | null;
}

export interface DeadlineAnchors {
  order_date?: string | null;
  hearing?: string | null;
}

const ANCHOR_LABEL: Record<DeadlineSpec['anchor'], string> = {
  order_date: 'date of this order',
  hearing: 'hearing',
};

/**
 * Resolve a relative-deadline spec against known anchors (the order date and the
 * hearing date). Returns null when the anchor it needs is unknown. The
 * explanation names the anchor and any bank holidays skipped.
 */
export function resolveDeadline(
  spec: DeadlineSpec,
  anchors: DeadlineAnchors,
  holidays: Holidays,
): { date: string; time: string | null; explanation: string } | null {
  const anchorDate = anchors[spec.anchor];
  if (!anchorDate) return null;
  const signed = spec.direction === 'after' ? spec.offset : -spec.offset;

  let date: string;
  let skipped: string[] = [];
  if (spec.unit === 'working') {
    const r = addWorkingDays(anchorDate, signed, holidays);
    date = r.date;
    skipped = r.skippedHolidays;
  } else {
    date = addCalendarDays(anchorDate, signed).date;
  }

  const unitWord = spec.unit === 'working' ? 'working ' : 'calendar ';
  const time = spec.time ?? null;
  const explanation =
    `${spec.offset} ${unitWord}day${plural(spec.offset)} ${spec.direction} the ` +
    `${ANCHOR_LABEL[spec.anchor]} on ${anchorDate}${holidayNote(skipped)} = ` +
    `${date}${time ? ` at ${time}` : ''}`;
  return { date, time, explanation };
}

// --- Expression parsing -----------------------------------------------------

function parseTime(text: string): string | null {
  const m = text.match(/(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]!.toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Parse a written deadline expression into a spec, e.g. "within 14 days of the
 * date of this order" or "no later than 4pm 10 working days before the hearing".
 * Returns null when the expression is not a recognised relative form.
 */
export function parseDeadlineExpression(text: string): DeadlineSpec | null {
  const m = text.match(
    /(\d+)\s+(working\s+)?(?:calendar\s+)?days?\s+(before|after|of|from)\b/i,
  );
  if (!m) return null;
  const offset = Number(m[1]);
  const unit: DeadlineSpec['unit'] = m[2] ? 'working' : 'calendar';
  const rel = m[3]!.toLowerCase();
  const direction: DeadlineSpec['direction'] =
    rel === 'before' ? 'before' : 'after';

  const lower = text.toLowerCase();
  let anchor: DeadlineSpec['anchor'] | null = null;
  if (lower.includes('hearing')) anchor = 'hearing';
  else if (lower.includes('order')) anchor = 'order_date';
  if (!anchor) return null;

  return { offset, unit, direction, anchor, time: parseTime(text) };
}
