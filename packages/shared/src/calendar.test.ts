import { describe, expect, it } from 'vitest';
import { KEY_DATE_TYPE_LABELS } from './config';
import {
  buildICalendar,
  compareEvents,
  eachDay,
  endOfMonth,
  endOfWeek,
  escapeICalText,
  foldICalLine,
  groupByDay,
  icalUid,
  isSameMonth,
  monthGrid,
  startOfMonth,
  startOfWeek,
  viewRange,
  type CalendarEvent,
} from './calendar';

function event(partial: Partial<CalendarEvent>): CalendarEvent {
  return {
    keyDateId: partial.keyDateId ?? 'k1',
    caseId: partial.caseId ?? 'c1',
    caseReference: partial.caseReference ?? 'RS-2026-1001',
    childName: partial.childName ?? 'Robin',
    title: partial.title ?? 'Hearing',
    type: partial.type ?? 'hearing',
    date: partial.date ?? '2026-06-08',
    time: partial.time ?? null,
    status: partial.status ?? 'Active',
    ownerUserId: partial.ownerUserId ?? 'u1',
    ownerName: partial.ownerName ?? 'Case Worker',
    teamCodes: partial.teamCodes ?? [],
    superseded: partial.superseded ?? false,
    sourceReference: partial.sourceReference ?? null,
  };
}

describe('week and month boundaries', () => {
  it('starts the week on Monday', () => {
    // 2026-06-10 is a Wednesday.
    expect(startOfWeek('2026-06-10')).toBe('2026-06-08');
    expect(endOfWeek('2026-06-10')).toBe('2026-06-14');
  });

  it('handles a Monday and a Sunday at the edges', () => {
    expect(startOfWeek('2026-06-08')).toBe('2026-06-08'); // Monday
    expect(startOfWeek('2026-06-14')).toBe('2026-06-08'); // Sunday
    expect(endOfWeek('2026-06-14')).toBe('2026-06-14');
  });

  it('finds month bounds', () => {
    expect(startOfMonth('2026-02-15')).toBe('2026-02-01');
    expect(endOfMonth('2026-02-15')).toBe('2026-02-28'); // 2026 not a leap year
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29'); // 2024 is
  });
});

describe('viewRange', () => {
  it('covers the week for the week view', () => {
    expect(viewRange('week', '2026-06-10')).toEqual({
      from: '2026-06-08',
      to: '2026-06-14',
    });
  });
  it('covers the month for the month view', () => {
    expect(viewRange('month', '2026-06-10')).toEqual({
      from: '2026-06-01',
      to: '2026-06-30',
    });
  });
  it('looks forward for the agenda view', () => {
    expect(viewRange('agenda', '2026-06-10', 30)).toEqual({
      from: '2026-06-10',
      to: '2026-07-10',
    });
  });
});

describe('monthGrid', () => {
  it('lays the month out as whole Monday–Sunday weeks', () => {
    const weeks = monthGrid('2026-06-10');
    // June 2026: 1st is a Monday, 30th a Tuesday → 5 weeks.
    expect(weeks).toHaveLength(5);
    expect(weeks[0]![0]).toBe('2026-06-01');
    expect(weeks.at(-1)!.at(-1)).toBe('2026-07-05');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it('pads a month that does not start on Monday', () => {
    // February 2026: 1st is a Sunday, so the first cell is the Monday before.
    const weeks = monthGrid('2026-02-15');
    expect(weeks[0]![0]).toBe('2026-01-26');
    expect(isSameMonth('2026-01-26', '2026-02-15')).toBe(false);
    expect(isSameMonth('2026-02-01', '2026-02-15')).toBe(true);
  });
});

describe('eachDay', () => {
  it('is inclusive of both ends', () => {
    expect(eachDay('2026-06-08', '2026-06-10')).toEqual([
      '2026-06-08',
      '2026-06-09',
      '2026-06-10',
    ]);
  });
});

describe('compareEvents and groupByDay', () => {
  it('orders by date, then time (untimed last), then title', () => {
    const a = event({ date: '2026-06-08', time: '09:00', title: 'A' });
    const b = event({ date: '2026-06-08', time: null, title: 'B' });
    const c = event({ date: '2026-06-08', time: '09:00', title: 'C' });
    const sorted = [b, c, a].sort(compareEvents);
    expect(sorted.map((e) => e.title)).toEqual(['A', 'C', 'B']);
  });

  it('groups events by day, each day sorted', () => {
    const e1 = event({ keyDateId: 'k1', date: '2026-06-09', time: '10:00' });
    const e2 = event({ keyDateId: 'k2', date: '2026-06-08', time: '14:00' });
    const e3 = event({ keyDateId: 'k3', date: '2026-06-08', time: '09:00' });
    const map = groupByDay([e1, e2, e3]);
    expect([...map.keys()].sort()).toEqual(['2026-06-08', '2026-06-09']);
    expect(map.get('2026-06-08')!.map((e) => e.keyDateId)).toEqual([
      'k3',
      'k2',
    ]);
  });
});

describe('iCal escaping and folding', () => {
  it('escapes commas, semicolons, backslashes and newlines', () => {
    expect(escapeICalText('a, b; c\\d\ne')).toBe('a\\, b\\; c\\\\d\\ne');
  });

  it('folds long lines to 75 octets with CRLF + space', () => {
    const folded = foldICalLine('X'.repeat(200));
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0]!.length).toBe(75);
    expect(parts[1]!.startsWith(' ')).toBe(true);
  });
});

describe('buildICalendar', () => {
  const opts = {
    calName: 'reSEND — Case Worker',
    now: new Date('2026-06-01T09:00:00Z'),
    typeLabels: KEY_DATE_TYPE_LABELS,
  };

  it('emits a VCALENDAR with a VEVENT per live event', () => {
    const ics = buildICalendar(
      [
        event({ keyDateId: 'k1', date: '2026-06-08', time: '10:00' }),
        event({
          keyDateId: 'k2',
          date: '2026-05-01',
          time: null,
          type: 'evidence_deadline',
          title: 'Evidence deadline',
        }),
      ],
      opts,
    );
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain(`UID:${icalUid('k1')}`);
    // Timed event: floating local start + one-hour end.
    expect(ics).toContain('DTSTART:20260608T100000');
    expect(ics).toContain('DTEND:20260608T110000');
    // Untimed event: all-day, DTEND is the next day (exclusive).
    expect(ics).toContain('DTSTART;VALUE=DATE:20260501');
    expect(ics).toContain('DTEND;VALUE=DATE:20260502');
    // Summary carries the reference and child name.
    expect(ics).toContain('SUMMARY:RS-2026-1001 · Robin — Hearing');
    // Lines are CRLF-terminated.
    expect(ics.includes('\r\n')).toBe(true);
  });

  it('omits superseded events — a phone shows the current timetable', () => {
    const ics = buildICalendar(
      [
        event({ keyDateId: 'live', date: '2026-06-08' }),
        event({ keyDateId: 'old', date: '2026-05-01', superseded: true }),
      ],
      opts,
    );
    expect(ics).toContain(icalUid('live'));
    expect(ics).not.toContain(icalUid('old'));
  });
});
