/**
 * England & Wales bank holidays, checked in as a fallback so a GOV.UK feed
 * outage cannot break deadline calculation. Mirrors the shape of the
 * england-and-wales events in https://www.gov.uk/bank-holidays.json.
 *
 * Refresh from the feed periodically; the loader prefers the live feed and only
 * falls back to this snapshot on error.
 */
export interface BankHolidayEvent {
  date: string; // YYYY-MM-DD
  title: string;
}

export const BANK_HOLIDAYS_SNAPSHOT: readonly BankHolidayEvent[] = [
  // 2024
  { date: '2024-01-01', title: "New Year's Day" },
  { date: '2024-03-29', title: 'Good Friday' },
  { date: '2024-04-01', title: 'Easter Monday' },
  { date: '2024-05-06', title: 'Early May bank holiday' },
  { date: '2024-05-27', title: 'Spring bank holiday' },
  { date: '2024-08-26', title: 'Summer bank holiday' },
  { date: '2024-12-25', title: 'Christmas Day' },
  { date: '2024-12-26', title: 'Boxing Day' },
  // 2025
  { date: '2025-01-01', title: "New Year's Day" },
  { date: '2025-04-18', title: 'Good Friday' },
  { date: '2025-04-21', title: 'Easter Monday' },
  { date: '2025-05-05', title: 'Early May bank holiday' },
  { date: '2025-05-26', title: 'Spring bank holiday' },
  { date: '2025-08-25', title: 'Summer bank holiday' },
  { date: '2025-12-25', title: 'Christmas Day' },
  { date: '2025-12-26', title: 'Boxing Day' },
  // 2026
  { date: '2026-01-01', title: "New Year's Day" },
  { date: '2026-04-03', title: 'Good Friday' },
  { date: '2026-04-06', title: 'Easter Monday' },
  { date: '2026-05-04', title: 'Early May bank holiday' },
  { date: '2026-05-25', title: 'Spring bank holiday' },
  { date: '2026-08-31', title: 'Summer bank holiday' },
  { date: '2026-12-25', title: 'Christmas Day' },
  { date: '2026-12-28', title: 'Boxing Day (substitute day)' },
  // 2027
  { date: '2027-01-01', title: "New Year's Day" },
  { date: '2027-03-26', title: 'Good Friday' },
  { date: '2027-03-29', title: 'Easter Monday' },
  { date: '2027-05-03', title: 'Early May bank holiday' },
  { date: '2027-05-31', title: 'Spring bank holiday' },
  { date: '2027-08-30', title: 'Summer bank holiday' },
  { date: '2027-12-27', title: 'Christmas Day (substitute day)' },
  { date: '2027-12-28', title: 'Boxing Day (substitute day)' },
];
