/**
 * time.ts — time recording: reading what a caseworker types as a duration,
 * rounding to the charity's unit, formatting hours and money, and the period
 * arithmetic behind "My time". Pure, shared by the API and the web app.
 */

import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from './calendar';
import {
  TIME_ENTRY_MAX_BACKDATE_DAYS,
  TIME_ENTRY_MAX_MINUTES,
  TIME_RECORDING_ROLES,
  TIME_UNIT_MINUTES,
  type RateKind,
  type TimePeriod,
} from './config';

/** Whether a role records its own time (writes billables). */
export function canRecordTime(role: string | undefined): boolean {
  return (TIME_RECORDING_ROLES as readonly string[]).includes(role ?? '');
}

/**
 * Read a duration as people type it: "45", "45m", "1h", "1h 30m", "1h30",
 * "1:30", "1.5", "1.5h", "90 mins", "2 hours". A bare whole number of 15 or
 * more is minutes ("45", "90"); a decimal is hours ("1.5"). A bare small whole
 * number ("2", "5") is ambiguous — hours or minutes? — so it is not read; see
 * `isAmbiguousDuration`. Returns whole minutes, or null.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s || isAmbiguousDuration(s)) return null;

  let minutes: number | null = null;
  const colon = s.match(/^(\d+):([0-5]\d)$/);
  const hm = s.match(
    /^(?:(\d+(?:\.\d+)?) ?(?:h|hr|hrs|hour|hours))? ?(?:(\d+) ?(?:m|min|mins|minute|minutes)?)?$/,
  );
  if (colon) {
    minutes = Number(colon[1]) * 60 + Number(colon[2]);
  } else if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    minutes = s.includes('.') ? n * 60 : n;
  } else if (hm && (hm[1] || hm[2])) {
    minutes = (hm[1] ? Number(hm[1]) * 60 : 0) + (hm[2] ? Number(hm[2]) : 0);
  }
  if (minutes === null || !Number.isFinite(minutes)) return null;
  const whole = Math.round(minutes);
  return whole > 0 ? whole : null;
}

/** A bare whole number under 15 ("2", "5"): hours or minutes cannot be told. */
export function isAmbiguousDuration(input: string): boolean {
  const s = input.trim();
  return /^\d+$/.test(s) && Number(s) > 0 && Number(s) < 15;
}

/** Round up to the recording unit (15 minutes): 1 → 15, 15 → 15, 16 → 30. */
export function roundUpToUnit(minutes: number): number {
  return Math.ceil(minutes / TIME_UNIT_MINUTES) * TIME_UNIT_MINUTES;
}

/** Why a duration cannot be recorded, or null when it can. */
export function durationProblem(
  minutes: number | null,
  input = '',
): string | null {
  if (isAmbiguousDuration(input)) {
    const n = input.trim();
    return `Hours or minutes? Type ${n}h or ${n}m.`;
  }
  if (minutes === null) return 'Enter the time spent, e.g. 45m or 1h 30m.';
  if (roundUpToUnit(minutes) > TIME_ENTRY_MAX_MINUTES)
    return `One entry can be at most ${formatMinutes(TIME_ENTRY_MAX_MINUTES)}.`;
  return null;
}

/**
 * Why a billable cannot be dated `date`, or null when it can: never in the
 * future, and at most TIME_ENTRY_MAX_BACKDATE_DAYS back (to catch typos).
 */
export function entryDateProblem(date: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Enter a valid date.';
  if (date > today) return 'Time cannot be recorded for a future date.';
  const earliest = new Date(`${today}T00:00:00Z`);
  earliest.setUTCDate(earliest.getUTCDate() - TIME_ENTRY_MAX_BACKDATE_DAYS);
  if (date < earliest.toISOString().slice(0, 10))
    return `Time can be dated at most ${TIME_ENTRY_MAX_BACKDATE_DAYS} days back.`;
  return null;
}

/** "45m", "1h", "1h 15m", "0m". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Hours as a decimal for totals: 75 → "1.25". */
export function formatHoursDecimal(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

/** "£12.50" from pence. */
export function formatPence(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  return `${sign}£${Math.floor(abs / 100).toLocaleString('en-GB')}.${String(abs % 100).padStart(2, '0')}`;
}

/** Read "12.50" / "£12.50" / "12" as pence, or null. */
export function parsePounds(input: string): number | null {
  const s = input.trim().replace(/^£/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** What `minutes` earn at an hourly rate in pence, to the nearest penny. */
export function earningsPence(minutes: number, hourlyPence: number): number {
  return Math.round((minutes * hourlyPence) / 60);
}

/** The inclusive [from, to] of the day, week (Mon–Sun) or month around `anchor`. */
export function periodRange(
  period: TimePeriod,
  anchor: string,
): { from: string; to: string } {
  if (period === 'day') return { from: anchor, to: anchor };
  if (period === 'week')
    return { from: startOfWeek(anchor), to: endOfWeek(anchor) };
  return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
}

/** The anchor one period earlier (-1) or later (+1). */
export function shiftPeriod(
  period: TimePeriod,
  anchor: string,
  step: -1 | 1,
): string {
  const d = new Date(`${anchor}T00:00:00Z`);
  if (period === 'day') d.setUTCDate(d.getUTCDate() + step);
  else if (period === 'week') d.setUTCDate(d.getUTCDate() + 7 * step);
  else {
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + step);
  }
  return d.toISOString().slice(0, 10);
}

// --- API shapes ---------------------------------------------------------------

/** One recorded entry on the "My time" page. */
export interface TimeEntryRow {
  id: string;
  noteId: string | null;
  caseId: string;
  caseReference: string;
  childName: string | null;
  entryDate: string;
  minutes: number;
  narrative: string | null;
  /** Earnings at the pay rate in force on the entry date; null if none set. */
  earningsPence: number | null;
  /** The case has since been deleted; the time still counts, it was worked. */
  caseDeleted: boolean;
}

/** A billable written by this person that has no time recorded yet. */
export interface MissingTimeRow {
  noteId: string;
  caseId: string;
  caseReference: string;
  entryDate: string;
}

export interface TimeReport {
  userId: string;
  userName: string;
  from: string;
  to: string;
  totalMinutes: number;
  /** Null when no pay rate was in force for any entry in the period. */
  totalEarningsPence: number | null;
  /** Entries in the period with no pay rate in force (so earnings are partial). */
  entriesWithoutRate: number;
  entries: TimeEntryRow[];
  missingTime: MissingTimeRow[];
}

/** Time recorded on one case, for the Billables tab. */
export interface CaseTimeSummary {
  totalMinutes: number;
  byPerson: { userId: string; name: string; minutes: number }[];
  missingTimeCount: number;
}

/** A member of staff and their current rates, for the admin rates screen. */
export interface StaffRates {
  userId: string;
  displayName: string;
  role: string;
  pay: { ratePence: number; effectiveFrom: string } | null;
  work: { ratePence: number; effectiveFrom: string } | null;
  /** Every rate set for this person, newest first, including upcoming ones. */
  history: StaffRateRow[];
}

export interface StaffRateRow {
  id: string;
  kind: RateKind;
  ratePence: number;
  effectiveFrom: string;
}
