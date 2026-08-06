import { describe, expect, it } from 'vitest';
import {
  calendarDaysBetween,
  formatCivilDate,
  isMissingConsent,
  keyDateCell,
  londonToday,
  relativeSince,
  selectPrimaryKeyDate,
  typeOfCase,
  type KeyDateLite,
} from './case-list';

const kd = (
  date: string,
  type: KeyDateLite['type'],
  title: string,
  time: string | null = null,
): KeyDateLite => ({ id: `${date}-${type}`, date, time, type, title });

describe('typeOfCase', () => {
  it('prefers current work, falls back to original query', () => {
    expect(typeOfCase('Section Appeal', 'Appeal - Section')).toBe(
      'Section Appeal',
    );
    expect(typeOfCase(null, 'Appeal - Section')).toBe('Appeal - Section');
    expect(typeOfCase(null, null)).toBeNull();
  });
});

describe('londonToday', () => {
  it('respects British Summer Time and GMT', () => {
    // 23:30 UTC on 1 Jun is 00:30 BST on 2 Jun.
    expect(londonToday(new Date('2026-06-01T23:30:00Z'))).toBe('2026-06-02');
    // 23:30 UTC on 1 Jan is still 1 Jan in GMT.
    expect(londonToday(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-01');
  });
});

describe('calendarDaysBetween', () => {
  it('counts whole calendar days regardless of month boundaries', () => {
    expect(calendarDaysBetween('2026-09-14', '2026-09-26')).toBe(12);
    expect(calendarDaysBetween('2026-09-26', '2026-09-14')).toBe(-12);
    expect(calendarDaysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });
});

describe('selectPrimaryKeyDate', () => {
  const today = '2026-09-14';

  it('returns none for an empty set', () => {
    expect(selectPrimaryKeyDate([], today)).toEqual({
      primary: null,
      sameDay: [],
    });
  });

  it('picks the soonest upcoming date', () => {
    const result = selectPrimaryKeyDate(
      [
        kd('2026-12-01', 'annual_review', 'AR'),
        kd('2026-09-26', 'hearing', 'Hearing'),
      ],
      today,
    );
    expect(result.primary?.date).toBe('2026-09-26');
    expect(result.sameDay).toHaveLength(0);
  });

  it('breaks same-day ties by type priority, hearing first', () => {
    const result = selectPrimaryKeyDate(
      [
        kd('2026-09-26', 'working_document', 'WD'),
        kd('2026-09-26', 'hearing', 'Hearing'),
        kd('2026-09-26', 'evidence_deadline', 'Deadline'),
      ],
      today,
    );
    expect(result.primary?.type).toBe('hearing');
    expect(result.sameDay.map((k) => k.type)).toEqual([
      'evidence_deadline',
      'working_document',
    ]);
  });

  it('falls back to the most recent past date when nothing is upcoming', () => {
    const result = selectPrimaryKeyDate(
      [
        kd('2026-01-01', 'hearing', 'Old'),
        kd('2026-08-01', 'hearing', 'Recent'),
      ],
      today,
    );
    expect(result.primary?.date).toBe('2026-08-01');
  });
});

describe('keyDateCell', () => {
  const today = '2026-09-14';

  it('words today, tomorrow and yesterday', () => {
    expect(
      keyDateCell(kd('2026-09-14', 'hearing', 'Hearing'), today, 'Active')
        .detail,
    ).toContain('Today');
    expect(
      keyDateCell(kd('2026-09-15', 'hearing', 'Hearing'), today, 'Active')
        .detail,
    ).toContain('Tomorrow');
    expect(
      keyDateCell(kd('2026-09-13', 'hearing', 'Hearing'), today, 'Active')
        .detail,
    ).toContain('Yesterday');
  });

  it('words future and overdue', () => {
    expect(
      keyDateCell(kd('2026-09-26', 'hearing', 'Hearing'), today, 'Active')
        .detail,
    ).toBe('in 12 days · 26 Sep 2026');
    const past = keyDateCell(
      kd('2026-09-11', 'hearing', 'Hearing'),
      today,
      'Active',
    );
    expect(past.detail).toBe('3 days overdue · 11 Sep 2026');
    expect(past.overdue).toBe(true);
  });

  it('shows None set with no date', () => {
    const cell = keyDateCell(null, today, 'Active');
    expect(cell).toMatchObject({
      title: null,
      detail: 'None set',
      noneSet: true,
    });
  });

  it('suppresses the countdown on Closed and Dormant cases', () => {
    expect(
      keyDateCell(kd('2026-09-11', 'hearing', 'Hearing'), today, 'Closed')
        .detail,
    ).toBe('11 Sep 2026');
    expect(
      keyDateCell(kd('2026-09-26', 'hearing', 'Hearing'), today, 'Dormant')
        .detail,
    ).toBe('26 Sep 2026');
  });
});

describe('formatCivilDate', () => {
  it('formats as D Mon YYYY', () => {
    expect(formatCivilDate('2026-09-26')).toBe('26 Sep 2026');
    expect(formatCivilDate('2026-01-01')).toBe('1 Jan 2026');
  });
});

describe('relativeSince', () => {
  const today = '2026-09-14';
  it('describes note recency', () => {
    expect(relativeSince(null, today)).toBe('No notes yet');
    expect(relativeSince('2026-09-14', today)).toBe('Today');
    expect(relativeSince('2026-09-13', today)).toBe('Yesterday');
    expect(relativeSince('2026-09-11', today)).toBe('3 days ago');
  });
});

describe('isMissingConsent', () => {
  const base = {
    status: 'Active' as const,
    consentDataProcessing: true,
    consentInformationSharing: true,
    consentContact: true,
    consentPrivacyNotice: true,
  };
  it('is true only for active cases missing an agreement', () => {
    expect(isMissingConsent(base)).toBe(false);
    expect(isMissingConsent({ ...base, consentContact: false })).toBe(true);
    expect(
      isMissingConsent({ ...base, status: 'Closed', consentContact: false }),
    ).toBe(false);
  });
});
