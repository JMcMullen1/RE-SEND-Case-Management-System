import type {
  BankHolidayEvent,
  CalendarEvent,
  CalendarFilters,
} from '@re-send/shared';
import { request } from './client';

export interface CalendarCaseMatch {
  id: string;
  caseReference: string;
  childName: string | null;
  clientName: string | null;
}

/** Serialise the calendar filters into query params. */
function toParams(filters: CalendarFilters): string {
  const p = new URLSearchParams();
  p.set('scope', filters.scope);
  if (filters.userId) p.set('userId', filters.userId);
  if (filters.team) p.set('team', filters.team);
  if (filters.types?.length) p.set('types', filters.types.join(','));
  if (filters.statuses?.length) p.set('statuses', filters.statuses.join(','));
  if (filters.includeSuperseded) p.set('includeSuperseded', 'true');
  if (filters.from) p.set('from', filters.from);
  if (filters.to) p.set('to', filters.to);
  return p.toString();
}

export function fetchCalendar(
  filters: CalendarFilters,
): Promise<{ events: CalendarEvent[] }> {
  return request(`/api/calendar?${toParams(filters)}`);
}

export function fetchBankHolidays(): Promise<{
  source: 'feed' | 'snapshot';
  events: BankHolidayEvent[];
}> {
  return request('/api/bank-holidays');
}

export function searchCalendarCases(
  q: string,
): Promise<{ cases: CalendarCaseMatch[] }> {
  return request(`/api/calendar/case-search?q=${encodeURIComponent(q)}`);
}

export function fetchFeedUrl(): Promise<{ path: string | null }> {
  return request('/api/calendar/feed-url');
}

export function rotateFeedUrl(): Promise<{ path: string | null }> {
  return request('/api/calendar/feed-url/rotate', { method: 'POST' });
}
