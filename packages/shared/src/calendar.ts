/**
 * calendar.ts — types and pure logic for the shared calendar.
 *
 * The calendar is a projection of key dates across every case. This module holds
 * the event shape, the filter shape, the pure date maths behind the agenda, week
 * and month views, and the iCal feed builder. Nothing here touches a database or
 * the network, so every view and the feed are straightforward to test.
 *
 * The iCal builder is a pure projection with stable per-key-date UIDs. Two-way
 * Microsoft Graph sync can be added later as a separate mapping (key date ↔
 * Graph event id ↔ etag) that reuses this same projection — it does not need to
 * be unpicked to get there.
 */

import type { KeyDateType, Status, Team } from './config';

export const CALENDAR_VIEW_VALUES = ['agenda', 'week', 'month'] as const;
export type CalendarView = (typeof CALENDAR_VIEW_VALUES)[number];

/** Whose dates to show: mine, everyone's, or one named person's. */
export const CALENDAR_SCOPE_VALUES = ['mine', 'all', 'user'] as const;
export type CalendarScope = (typeof CALENDAR_SCOPE_VALUES)[number];

/** One key date, projected for the calendar with the case context it needs. */
export interface CalendarEvent {
  keyDateId: string;
  caseId: string;
  caseReference: string;
  /** The child's preferred name (falls back to full name server-side). */
  childName: string | null;
  title: string;
  type: KeyDateType;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM
  status: Status;
  ownerUserId: string | null;
  ownerName: string | null;
  teamCodes: Team[];
  /** True for a superseded entry, shown only when history is toggled on. */
  superseded: boolean;
  sourceReference: string | null;
}

export interface CalendarFilters {
  scope: CalendarScope;
  /** The named person, when scope is 'user'. */
  userId?: string | null;
  team?: Team | null;
  types?: KeyDateType[];
  statuses?: Status[];
  includeSuperseded?: boolean;
  from?: string;
  to?: string;
}

// --- UTC date helpers (avoid DST drift; dates are calendar days) -------------

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
/** 0 = Monday … 6 = Sunday (UK week starts Monday). */
function mondayIndex(iso: string): number {
  return (toDate(iso).getUTCDay() + 6) % 7;
}

export function startOfWeek(iso: string): string {
  return shift(iso, -mondayIndex(iso));
}
export function endOfWeek(iso: string): string {
  return shift(startOfWeek(iso), 6);
}
export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}
export function endOfMonth(iso: string): string {
  const d = toDate(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return toISO(d);
}

/** The inclusive [from, to] a view covers, given the anchor day it is centred on. */
export function viewRange(
  view: CalendarView,
  anchor: string,
  agendaDays = 60,
): { from: string; to: string } {
  if (view === 'week')
    return { from: startOfWeek(anchor), to: endOfWeek(anchor) };
  if (view === 'month')
    return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
  // Agenda looks forward from the anchor day — deadline work is a forward list.
  return { from: anchor, to: shift(anchor, agendaDays) };
}

/** Every ISO day in [from, to] inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    out.push(cursor);
    cursor = shift(cursor, 1);
  }
  return out;
}

/**
 * The month laid out as full Monday–Sunday weeks, each a list of ISO days. Days
 * spilling from the neighbouring months fill the leading and trailing cells.
 */
export function monthGrid(anchor: string): string[][] {
  const first = startOfWeek(startOfMonth(anchor));
  const last = endOfWeek(endOfMonth(anchor));
  const days = eachDay(first, last);
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

/** Chronological compare for events: by date, then time (untimed last), then title. */
export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const at = a.time ?? '99:99';
  const bt = b.time ?? '99:99';
  if (at !== bt) return at < bt ? -1 : 1;
  return a.title.localeCompare(b.title);
}

/** Group events by their ISO day, each day's list sorted chronologically. */
export function groupByDay(
  events: CalendarEvent[],
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const list = map.get(e.date);
    if (list) list.push(e);
    else map.set(e.date, [e]);
  }
  for (const list of map.values()) list.sort(compareEvents);
  return map;
}

export function isSameMonth(iso: string, anchor: string): boolean {
  return iso.slice(0, 7) === anchor.slice(0, 7);
}

// --- iCal (RFC 5545) feed ---------------------------------------------------

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Escape a text value for iCal (RFC 5545 §3.3.11). */
export function escapeICalText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold a content line to 75 octets with CRLF + space continuation. */
export function foldICalLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest.length > 0) parts.push(` ${rest}`);
  return parts.join('\r\n');
}

/** A UTC timestamp as YYYYMMDDTHHMMSSZ, for DTSTAMP. */
export function icalTimestamp(now: Date): string {
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  );
}

/** The stable iCal UID for a key date — the anchor a future Graph sync maps on. */
export function icalUid(keyDateId: string): string {
  return `keydate-${keyDateId}@resend-cms`;
}

export interface ICalOptions {
  calName: string;
  now: Date;
  typeLabels: Record<KeyDateType, string>;
}

/** Build the VEVENT lines for one event (timed → 1 hour; untimed → all day). */
function eventLines(e: CalendarEvent, opts: ICalOptions): string[] {
  const dateCompact = e.date.replace(/-/g, '');
  const lines: string[] = ['BEGIN:VEVENT', `UID:${icalUid(e.keyDateId)}`];
  lines.push(`DTSTAMP:${icalTimestamp(opts.now)}`);

  if (e.time) {
    const [h, m] = e.time.split(':').map(Number);
    const start = `${dateCompact}T${pad(h!)}${pad(m!)}00`;
    const endDate = new Date(Date.UTC(2000, 0, 1, (h ?? 0) + 1, m ?? 0));
    const end = `${dateCompact}T${pad(endDate.getUTCHours())}${pad(endDate.getUTCMinutes())}00`;
    // Floating local time: no TZID, no Z — the phone shows the wall-clock time.
    lines.push(`DTSTART:${start}`, `DTEND:${end}`);
  } else {
    // All-day event: DTEND is the (exclusive) next day, per RFC 5545.
    lines.push(
      `DTSTART;VALUE=DATE:${dateCompact}`,
      `DTEND;VALUE=DATE:${shiftCompact(e.date)}`,
    );
  }

  const name = e.childName ? ` · ${e.childName}` : '';
  const summary = `${e.caseReference}${name} — ${e.title}`;
  lines.push(`SUMMARY:${escapeICalText(summary)}`);

  const descParts = [opts.typeLabels[e.type], `Status: ${e.status}`];
  if (e.sourceReference) descParts.push(e.sourceReference);
  lines.push(`DESCRIPTION:${escapeICalText(descParts.join(' · '))}`);
  lines.push(`CATEGORIES:${escapeICalText(opts.typeLabels[e.type])}`);
  lines.push('END:VEVENT');
  return lines;
}

function shiftCompact(iso: string): string {
  return shift(iso, 1).replace(/-/g, '');
}

/**
 * Build a full VCALENDAR document from a set of events. Only live (non
 * superseded) events belong in the feed — a phone should show the current
 * timetable, not its history.
 */
export function buildICalendar(
  events: CalendarEvent[],
  opts: ICalOptions,
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RE-SEND//Case Management//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICalText(opts.calName)}`,
  ];
  for (const e of events) {
    if (e.superseded) continue;
    lines.push(...eventLines(e, opts));
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldICalLine).join('\r\n') + '\r\n';
}
