/**
 * time.ts — time recording: reading what a caseworker types as a duration,
 * rounding to the charity's unit, formatting hours and money, and the period
 * arithmetic behind "My time". Pure, shared by the API and the web app.
 */

import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from './calendar';
import {
  TIME_ENTRY_MAX_MINUTES,
  TIME_UNIT_MINUTES,
  type TimePeriod,
} from './config';

/**
 * Read a duration as people type it: "45", "45m", "1h", "1h 30m", "1h30",
 * "1:30", "1.5", "1.5h", "90 mins", "2 hours". A bare whole number of 10 or
 * more is minutes ("45"); a bare small number or a decimal is hours ("2",
 * "1.5"). Returns whole minutes, or null when it cannot be read or is zero.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;

  let minutes: number | null = null;
  const colon = s.match(/^(\d+):([0-5]\d)$/);
  const hm = s.match(
    /^(?:(\d+(?:\.\d+)?) ?(?:h|hr|hrs|hour|hours))? ?(?:(\d+) ?(?:m|min|mins|minute|minutes)?)?$/,
  );
  if (colon) {
    minutes = Number(colon[1]) * 60 + Number(colon[2]);
  } else if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    minutes = s.includes('.') || n < 10 ? n * 60 : n;
  } else if (hm && (hm[1] || hm[2])) {
    minutes = (hm[1] ? Number(hm[1]) * 60 : 0) + (hm[2] ? Number(hm[2]) : 0);
  }
  if (minutes === null || !Number.isFinite(minutes)) return null;
  const whole = Math.round(minutes);
  return whole > 0 ? whole : null;
}

/** Round up to the recording unit (15 minutes): 1 → 15, 15 → 15, 16 → 30. */
export function roundUpToUnit(minutes: number): number {
  return Math.ceil(minutes / TIME_UNIT_MINUTES) * TIME_UNIT_MINUTES;
}

/** Why a duration cannot be recorded, or null when it can. */
export function durationProblem(minutes: number | null): string | null {
  if (minutes === null) return 'Enter the time spent, e.g. 45m or 1h 30m.';
  if (roundUpToUnit(minutes) > TIME_ENTRY_MAX_MINUTES)
    return `One entry can be at most ${formatMinutes(TIME_ENTRY_MAX_MINUTES)}.`;
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
}
