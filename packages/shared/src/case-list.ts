/**
 * case-list.ts — pure domain logic for the case list.
 *
 * All of this is deterministic and framework-free so it can be unit tested and
 * shared by the API (sorting, filtering) and the web app (the key date column,
 * which must recompute its countdown on the client against Europe/London).
 */

import { KEY_DATE_TYPE_PRIORITY } from './config';
import type {
  ConsultationState,
  EnquiryMethod,
  KeyDateType,
  OwnerQueue,
  Status,
  Team,
} from './config';

// --- DTOs shared by API and web ---------------------------------------------

/** A non-superseded key date, trimmed to what the list needs. */
export interface KeyDateLite {
  id: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM:SS
  type: KeyDateType;
  title: string;
}

export type CaseOwner =
  | { kind: 'user'; userId: string; displayName: string }
  | { kind: 'queue'; queue: OwnerQueue };

/** One row of the case list, as returned by the API. */
export interface CaseListRow {
  id: string;
  clientId: string | null;
  clientName: string | null;
  childName: string | null;
  currentWork: string | null;
  originalQuery: string | null;
  owner: CaseOwner;
  status: Status;
  shadowUserName: string | null;
  team: Team[];
  dateOfEnquiry: string | null;
  methodOfEnquiry: EnquiryMethod | null;
  schoolYear: string | null;
  paymentCode: string | null;
  discountCode: string | null;
  invoiceStatusText: string | null;
  consultStatus: ConsultationState;
  mostRecentNoteDate: string | null;
  lastReviewedAt: string | null;
  keyDates: KeyDateLite[];
}

// --- Type of case -----------------------------------------------------------

/** Current work, falling back to the original query when work is not yet set. */
export function typeOfCase(
  currentWork: string | null,
  originalQuery: string | null,
): string | null {
  return currentWork ?? originalQuery ?? null;
}

// --- Europe/London civil date ------------------------------------------------

/** Today's civil date (YYYY-MM-DD) in Europe/London for the given instant. */
export function londonToday(now: Date): string {
  // en-CA renders ISO-style YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Whole calendar days between two YYYY-MM-DD civil dates (to - from). */
export function calendarDaysBetween(fromISO: string, toISO: string): number {
  const from = Date.parse(`${fromISO}T00:00:00Z`);
  const to = Date.parse(`${toISO}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

// --- Key date selection ------------------------------------------------------

const STATUSES_SUPPRESSING_COUNTDOWN: ReadonlySet<Status> = new Set<Status>([
  'Closed',
  'Dormant',
]);

/**
 * The primary key date for a case, computed against `today` (a Europe/London
 * civil date). Superseded key dates are assumed already removed by the caller.
 *
 * - If any key date is today or later, the primary is the soonest such.
 * - Otherwise, if any key date is in the past, the primary is the most recent
 *   one (an outstanding, non-superseded past date — genuinely overdue).
 * - Otherwise there is no primary (rendered as "None set").
 *
 * Same-day ties are broken by type priority (hearing first). `sameDay` holds
 * the other key dates sharing the primary's date, most consequential first, for
 * the "+N" affordance and the row expansion.
 */
export interface PrimaryKeyDate {
  primary: KeyDateLite | null;
  sameDay: KeyDateLite[];
}

export function selectPrimaryKeyDate(
  keyDates: readonly KeyDateLite[],
  today: string,
): PrimaryKeyDate {
  if (keyDates.length === 0) return { primary: null, sameDay: [] };

  const upcoming = keyDates.filter((k) => k.date >= today);
  const pool = upcoming.length > 0 ? upcoming : keyDates;

  // Target date: soonest upcoming, else most recent past.
  let targetDate: string;
  if (upcoming.length > 0) {
    targetDate = pool.reduce(
      (min, k) => (k.date < min ? k.date : min),
      pool[0]!.date,
    );
  } else {
    targetDate = pool.reduce(
      (max, k) => (k.date > max ? k.date : max),
      pool[0]!.date,
    );
  }

  const onDay = keyDates
    .filter((k) => k.date === targetDate)
    .sort(byTypePriority);

  const [primary, ...sameDay] = onDay;
  return { primary: primary ?? null, sameDay };
}

function byTypePriority(a: KeyDateLite, b: KeyDateLite): number {
  const pa = KEY_DATE_TYPE_PRIORITY[a.type];
  const pb = KEY_DATE_TYPE_PRIORITY[b.type];
  if (pa !== pb) return pa - pb;
  // Stable within a type: earlier time first, untimed last.
  const ta = a.time ?? '99:99:99';
  const tb = b.time ?? '99:99:99';
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}

// --- Countdown wording -------------------------------------------------------

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Format a YYYY-MM-DD civil date as "26 Sep 2026". */
export function formatCivilDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((n) => Number(n));
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export interface KeyDateCell {
  /** Line one: what the key date is (its title), or null when none set. */
  title: string | null;
  /** Line two, rendered as-is. */
  detail: string;
  /** True when there is no key date at all — for muted styling and last-sort. */
  noneSet: boolean;
  /** True when the primary is in the past (the only place "overdue" appears). */
  overdue: boolean;
}

/**
 * The two lines of the key date cell, computed on the client at render time.
 * `status` suppresses the countdown on Closed and Dormant cases (date alone).
 */
export function keyDateCell(
  primary: KeyDateLite | null,
  today: string,
  status: Status,
): KeyDateCell {
  if (!primary) {
    return { title: null, detail: 'None set', noneSet: true, overdue: false };
  }

  const date = formatCivilDate(primary.date);
  if (STATUSES_SUPPRESSING_COUNTDOWN.has(status)) {
    return {
      title: primary.title,
      detail: date,
      noneSet: false,
      overdue: false,
    };
  }

  const diff = calendarDaysBetween(today, primary.date);
  const countdown = countdownWords(diff);
  return {
    title: primary.title,
    detail: `${countdown} · ${date}`,
    noneSet: false,
    overdue: diff < 0,
  };
}

function countdownWords(diffDays: number): string {
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1) return `in ${diffDays} days`;
  return `${-diffDays} days overdue`;
}

// --- "Updated" relative time -------------------------------------------------

/** Relative time since a civil date, e.g. "3 days ago", "Today". */
export function relativeSince(iso: string | null, today: string): string {
  if (!iso) return 'No notes yet';
  const diff = calendarDaysBetween(iso, today);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  if (diff < 14) return 'Last week';
  if (diff < 31) return `${Math.floor(diff / 7)} weeks ago`;
  if (diff < 62) return 'Last month';
  if (diff < 365) return `${Math.floor(diff / 30)} months ago`;
  return `${Math.floor(diff / 365)} year${diff >= 730 ? 's' : ''} ago`;
}

// --- Missing consent ---------------------------------------------------------

export interface CaseConsentFlags {
  status: Status;
  consentDataProcessing: boolean;
  consentInformationSharing: boolean;
  consentContact: boolean;
  consentPrivacyNotice: boolean;
}

/** An active case where any of the four agreements is unrecorded. */
export function isMissingConsent(flags: CaseConsentFlags): boolean {
  if (flags.status !== 'Active') return false;
  return (
    !flags.consentDataProcessing ||
    !flags.consentInformationSharing ||
    !flags.consentContact ||
    !flags.consentPrivacyNotice
  );
}
