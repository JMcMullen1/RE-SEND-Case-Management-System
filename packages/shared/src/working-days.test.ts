import { afterEach, describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  addWorkingDays,
  bankHolidays,
  isWorkingDay,
  loadBankHolidays,
  parseDeadlineExpression,
  resetBankHolidayCache,
  resolveDeadline,
  snapshotHolidays,
  workingDaysBetween,
  type BankHolidayEvent,
} from './working-days';

const H = snapshotHolidays();

describe('isWorkingDay', () => {
  it('treats weekends as non-working', () => {
    expect(isWorkingDay('2026-04-04', H)).toBe(false); // Saturday
    expect(isWorkingDay('2026-04-05', H)).toBe(false); // Sunday
  });

  it('treats a weekday as working', () => {
    expect(isWorkingDay('2026-04-02', H)).toBe(true); // Thursday
  });

  it('treats a bank holiday as non-working', () => {
    expect(isWorkingDay('2026-04-03', H)).toBe(false); // Good Friday
    expect(isWorkingDay('2026-04-06', H)).toBe(false); // Easter Monday
    expect(isWorkingDay('2026-12-25', H)).toBe(false); // Christmas Day
    expect(isWorkingDay('2026-12-28', H)).toBe(false); // Boxing Day substitute
  });
});

describe('addWorkingDays across the Easter cluster', () => {
  it('steps over Good Friday, the weekend and Easter Monday', () => {
    // Thursday before Good Friday + 1 working day lands on the Tuesday after
    // Easter Monday, skipping four non-working days in a row.
    const r = addWorkingDays('2026-04-02', 1, H);
    expect(r.date).toBe('2026-04-07');
    expect(r.skippedHolidays).toEqual(['Good Friday', 'Easter Monday']);
    expect(r.explanation).toBe(
      '1 working day after 2026-04-02 (skipping weekends and 2 bank holidays: ' +
        'Good Friday, Easter Monday) = 2026-04-07',
    );
  });

  it('resolves a longer span crossing Easter', () => {
    // 10 working days after the Thursday before Easter.
    const r = addWorkingDays('2026-04-02', 10, H);
    expect(r.date).toBe('2026-04-20');
    expect(r.skippedHolidays).toEqual(['Good Friday', 'Easter Monday']);
  });
});

describe('addWorkingDays across the Christmas and New Year cluster', () => {
  it('steps over Christmas Day and the Boxing Day substitute', () => {
    const r = addWorkingDays('2026-12-24', 1, H);
    expect(r.date).toBe('2026-12-29');
    expect(r.skippedHolidays).toEqual([
      'Christmas Day',
      'Boxing Day (substitute day)',
    ]);
  });

  it('steps over New Year across the year boundary', () => {
    const r = addWorkingDays('2026-12-31', 1, H);
    expect(r.date).toBe('2027-01-04');
    expect(r.skippedHolidays).toEqual(["New Year's Day"]);
  });

  it('crosses the whole festive period in one span', () => {
    // From the last working day before Christmas, 3 working days lands
    // after New Year, skipping Christmas, Boxing Day and New Year's Day.
    const r = addWorkingDays('2026-12-24', 3, H);
    expect(r.date).toBe('2026-12-31');
    const r2 = addWorkingDays('2026-12-24', 4, H);
    expect(r2.date).toBe('2027-01-04');
    expect(r2.skippedHolidays).toEqual([
      'Christmas Day',
      'Boxing Day (substitute day)',
      "New Year's Day",
    ]);
  });
});

describe('addWorkingDays subtracting (before a date)', () => {
  it('counts backwards over the Spring bank holiday', () => {
    // 10 working days before a hearing on Monday 2026-06-08.
    const r = addWorkingDays('2026-06-08', -10, H);
    expect(r.date).toBe('2026-05-22');
    expect(r.skippedHolidays).toEqual(['Spring bank holiday']);
    expect(r.explanation).toContain('10 working days before 2026-06-08');
    expect(r.explanation).toContain('Spring bank holiday');
    expect(r.explanation).toContain('= 2026-05-22');
  });

  it('is a no-op for zero', () => {
    const r = addWorkingDays('2026-06-08', 0, H);
    expect(r.date).toBe('2026-06-08');
    expect(r.skippedHolidays).toEqual([]);
  });
});

describe('addCalendarDays', () => {
  it('adds raw calendar days ignoring weekends and holidays', () => {
    const r = addCalendarDays('2026-04-01', 14);
    expect(r.date).toBe('2026-04-15');
    expect(r.explanation).toBe(
      '14 calendar days after 2026-04-01 = 2026-04-15',
    );
  });

  it('subtracts calendar days', () => {
    const r = addCalendarDays('2026-04-15', -14);
    expect(r.date).toBe('2026-04-01');
    expect(r.explanation).toBe(
      '14 calendar days before 2026-04-15 = 2026-04-01',
    );
  });
});

describe('workingDaysBetween', () => {
  it('is zero for the same day', () => {
    expect(workingDaysBetween('2026-04-02', '2026-04-02', H).days).toBe(0);
  });

  it('excludes weekends and bank holidays across Easter', () => {
    // Thu 2026-04-02 to Tue 2026-04-07: only Apr 7 is a working day after Apr 2.
    expect(workingDaysBetween('2026-04-02', '2026-04-07', H).days).toBe(1);
  });

  it('excludes the festive cluster', () => {
    // Thu 2026-12-24 to Mon 2027-01-04: working days are 29, 30, 31 Dec and 4 Jan.
    expect(workingDaysBetween('2026-12-24', '2027-01-04', H).days).toBe(4);
  });

  it('is negative when the second date precedes the first', () => {
    expect(workingDaysBetween('2026-01-05', '2026-01-02', H).days).toBe(-1);
  });
});

describe('parseDeadlineExpression', () => {
  it('parses "within 14 days of the date of this order"', () => {
    expect(
      parseDeadlineExpression('within 14 days of the date of this order'),
    ).toEqual({
      offset: 14,
      unit: 'calendar',
      direction: 'after',
      anchor: 'order_date',
      time: null,
    });
  });

  it('parses "no later than 4pm 10 working days before the hearing"', () => {
    expect(
      parseDeadlineExpression(
        'no later than 4pm 10 working days before the hearing',
      ),
    ).toEqual({
      offset: 10,
      unit: 'working',
      direction: 'before',
      anchor: 'hearing',
      time: '16:00',
    });
  });

  it('parses a half-hour time and a "from" relation', () => {
    expect(
      parseDeadlineExpression('by 4.30pm 5 working days from this order'),
    ).toEqual({
      offset: 5,
      unit: 'working',
      direction: 'after',
      anchor: 'order_date',
      time: '16:30',
    });
  });

  it('returns null when no relative form is present', () => {
    expect(
      parseDeadlineExpression('as soon as reasonably practicable'),
    ).toBeNull();
    expect(parseDeadlineExpression('within 14 days')).toBeNull(); // no anchor
  });
});

describe('resolveDeadline', () => {
  it('resolves a calendar deadline from the order date', () => {
    const spec = parseDeadlineExpression(
      'within 14 days of the date of this order',
    )!;
    const r = resolveDeadline(spec, { order_date: '2026-04-01' }, H);
    expect(r).not.toBeNull();
    expect(r!.date).toBe('2026-04-15');
    expect(r!.time).toBeNull();
    expect(r!.explanation).toBe(
      '14 calendar days after the date of this order on 2026-04-01 = 2026-04-15',
    );
  });

  it('resolves a working-day deadline before the hearing, carrying the time', () => {
    const spec = parseDeadlineExpression(
      'no later than 4pm 10 working days before the hearing',
    )!;
    const r = resolveDeadline(spec, { hearing: '2026-06-08' }, H);
    expect(r).not.toBeNull();
    expect(r!.date).toBe('2026-05-22');
    expect(r!.time).toBe('16:00');
    expect(r!.explanation).toContain('Spring bank holiday');
    expect(r!.explanation).toContain('= 2026-05-22 at 16:00');
  });

  it('returns null when the required anchor is unknown', () => {
    const spec = parseDeadlineExpression('10 working days before the hearing')!;
    expect(resolveDeadline(spec, { order_date: '2026-04-01' }, H)).toBeNull();
  });
});

describe('loadBankHolidays', () => {
  afterEach(() => resetBankHolidayCache());

  const feed: BankHolidayEvent[] = [
    { date: '2030-01-01', title: "New Year's Day" },
  ];

  function fakeFetch(ok: boolean): typeof fetch {
    return (async () =>
      ({
        ok,
        status: ok ? 200 : 503,
        json: async () => ({
          'england-and-wales': { events: feed },
        }),
      }) as unknown as Response) as unknown as typeof fetch;
  }

  it('prefers the live feed and caches it', async () => {
    const first = await loadBankHolidays({
      fetchImpl: fakeFetch(true),
      now: () => 1000,
    });
    expect(first.source).toBe('feed');
    expect(first.holidays.has('2030-01-01')).toBe(true);

    // Within TTL, a fetch that would fail is not consulted — cache holds.
    const second = await loadBankHolidays({
      fetchImpl: fakeFetch(false),
      now: () => 2000,
    });
    expect(second.source).toBe('feed');
  });

  it('falls back to the checked-in snapshot on feed failure', async () => {
    const r = await loadBankHolidays({
      fetchImpl: fakeFetch(false),
      now: () => 1000,
    });
    expect(r.source).toBe('snapshot');
    // Snapshot knows the 2026 Christmas cluster.
    expect(r.holidays.has('2026-12-28')).toBe(true);
  });

  it('re-fetches once the TTL has expired', async () => {
    await loadBankHolidays({ fetchImpl: fakeFetch(false), now: () => 0 });
    const later = await loadBankHolidays({
      fetchImpl: fakeFetch(true),
      now: () => 1000 * 60 * 60 * 25,
    });
    expect(later.source).toBe('feed');
  });
});

describe('bankHolidays lookup', () => {
  it('reports titles and count', () => {
    const h = bankHolidays([
      { date: '2026-12-25', title: 'Christmas Day' },
      { date: '2026-12-28', title: 'Boxing Day (substitute day)' },
    ]);
    expect(h.count).toBe(2);
    expect(h.title('2026-12-25')).toBe('Christmas Day');
    expect(h.title('2026-01-01')).toBeUndefined();
  });
});
