import { describe, expect, it } from 'vitest';
import {
  DSPL_AREA_VALUES,
  SCHOOL_YEAR_VALUES,
  STATUS_VALUES,
  StatusSchema,
  suggestDsplArea,
  suggestSchoolYear,
  THRESHOLDS,
  WORK_TYPE_VALUES,
} from './config';

describe('config vocabularies', () => {
  it('exposes the case statuses', () => {
    expect(STATUS_VALUES).toContain('Active');
    expect(STATUS_VALUES).toContain('Closed');
    expect(STATUS_VALUES).toHaveLength(6);
  });

  it('validates values through the matching Zod enum', () => {
    expect(StatusSchema.parse('Active')).toBe('Active');
    expect(StatusSchema.safeParse('Nope').success).toBe(false);
  });

  it('covers the full school-year range', () => {
    expect(SCHOOL_YEAR_VALUES).toContain('Reception');
    expect(SCHOOL_YEAR_VALUES).toContain('Yr14');
    expect(SCHOOL_YEAR_VALUES).toContain('Post19');
  });

  it('lists nine DSPL areas', () => {
    expect(DSPL_AREA_VALUES).toHaveLength(9);
  });

  it('includes work types and thresholds', () => {
    expect(WORK_TYPE_VALUES).toContain('CAP');
    expect(THRESHOLDS.staleNoteDays).toBeGreaterThan(0);
    expect(THRESHOLDS.reviewDueDays).toBeGreaterThan(0);
  });
});

describe('suggestions', () => {
  it('suggests a DSPL area from postcode area letters, overridable/null when unmapped', () => {
    expect(suggestDsplArea('AL10 8XX')).toBe('DSPL1');
    expect(suggestDsplArea('sg1 2ab')).toBe('DSPL3');
    expect(suggestDsplArea('EX1 1FX')).toBeNull();
    expect(suggestDsplArea('')).toBeNull();
  });

  it('suggests a school year from date of birth', () => {
    // Born Jan 2019; on 31 Aug 2025 the child is 6 → Year 2.
    expect(suggestSchoolYear('2019-01-15', '2026-08-06')).toBe('Yr2');
    // Born Sep 2021; on 31 Aug 2025 not yet 4 → Nursery/Pre-school.
    expect(suggestSchoolYear('2021-09-10', '2026-08-06')).toBe(
      'Nursery/Pre-school',
    );
    expect(suggestSchoolYear(null, '2026-08-06')).toBeNull();
  });
});
