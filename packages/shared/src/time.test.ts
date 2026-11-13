import { describe, expect, it } from 'vitest';
import {
  durationProblem,
  earningsPence,
  formatMinutes,
  formatPence,
  parseDuration,
  parsePounds,
  periodRange,
  roundUpToUnit,
  shiftPeriod,
} from './time';

describe('parseDuration', () => {
  it.each([
    ['45', 45],
    ['45m', 45],
    ['45 mins', 45],
    ['90 minutes', 90],
    ['1h', 60],
    ['2 hours', 120],
    ['1h 30m', 90],
    ['1h30', 90],
    ['1:30', 90],
    ['1.5', 90],
    ['1.5h', 90],
    ['2', 120],
    ['0.25', 15],
    ['  1H 15M ', 75],
  ])('reads %j as %i minutes', (input, minutes) => {
    expect(parseDuration(input)).toBe(minutes);
  });

  it.each(['', 'abc', '0', '1:75', '-1', 'h'])('rejects %j', (input) => {
    expect(parseDuration(input)).toBeNull();
  });
});

describe('roundUpToUnit', () => {
  it('rounds up to 15-minute units', () => {
    expect(roundUpToUnit(1)).toBe(15);
    expect(roundUpToUnit(15)).toBe(15);
    expect(roundUpToUnit(16)).toBe(30);
    expect(roundUpToUnit(50)).toBe(60);
  });
});

describe('durationProblem', () => {
  it('explains a missing or oversized time', () => {
    expect(durationProblem(null)).toMatch(/Enter the time/);
    expect(durationProblem(13 * 60)).toMatch(/at most 12h/);
    expect(durationProblem(45)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats minutes and money', () => {
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(135)).toBe('2h 15m');
    expect(formatPence(1250)).toBe('£12.50');
    expect(formatPence(123456)).toBe('£1,234.56');
  });
  it('reads pounds as pence', () => {
    expect(parsePounds('£12.50')).toBe(1250);
    expect(parsePounds('20')).toBe(2000);
    expect(parsePounds('1,200.5')).toBe(120050);
    expect(parsePounds('12.505')).toBeNull();
    expect(parsePounds('abc')).toBeNull();
  });
  it('computes earnings to the nearest penny', () => {
    expect(earningsPence(45, 2000)).toBe(1500);
    expect(earningsPence(15, 1333)).toBe(333);
  });
});

describe('periods', () => {
  it('gives day, Monday–Sunday week and calendar month ranges', () => {
    expect(periodRange('day', '2026-11-13')).toEqual({
      from: '2026-11-13',
      to: '2026-11-13',
    });
    expect(periodRange('week', '2026-11-13')).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
    });
    expect(periodRange('month', '2026-02-10')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });
  it('steps between periods', () => {
    expect(shiftPeriod('day', '2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftPeriod('week', '2026-11-13', 1)).toBe('2026-11-20');
    expect(shiftPeriod('month', '2026-01-31', 1)).toBe('2026-02-01');
  });
});
