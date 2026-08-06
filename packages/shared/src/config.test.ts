import { describe, expect, it } from 'vitest';
import {
  DSPL_AREA_VALUES,
  SCHOOL_YEAR_VALUES,
  STATUS_VALUES,
  StatusSchema,
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
