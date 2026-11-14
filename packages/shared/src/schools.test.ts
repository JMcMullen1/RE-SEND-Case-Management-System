import { describe, expect, it } from 'vitest';
import {
  ageRangeLabel,
  canEditSchools,
  normalisePostcode,
  normaliseUrn,
  schoolFactsLine,
  schoolFieldsProblem,
  schoolNameKey,
} from './schools';

describe('schoolNameKey', () => {
  it('treats common spellings of one school as the same', () => {
    expect(schoolNameKey("St. Mary's C of E Primary School")).toBe(
      schoolNameKey('St Marys CE Primary'),
    );
    expect(schoolNameKey('Saint Mary’s Primary')).toBe(
      schoolNameKey('St Marys Primary School'),
    );
    expect(schoolNameKey('Oak & Ash Academy')).toBe(
      schoolNameKey('Oak and Ash'),
    );
  });
  it('keeps different schools different', () => {
    expect(schoolNameKey('Marlborough Primary')).not.toBe(
      schoolNameKey('Marlborough Secondary'),
    );
  });
});

describe('normalisers', () => {
  it('normalises postcodes and URNs', () => {
    expect(normalisePostcode(' al12ab ')).toBe('AL1 2AB');
    expect(normalisePostcode('')).toBeNull();
    expect(normaliseUrn(' 123 456 ')).toBe('123456');
    expect(normaliseUrn('')).toBeNull();
  });
});

describe('facts', () => {
  it('summarises a school in one line', () => {
    expect(
      schoolFactsLine({
        funding: 'independent',
        provision: 'specialist',
        section41: true,
        ageFrom: 11,
        ageTo: 19,
      }),
    ).toBe('Independent · Specialist · Section 41 · Ages 11–19');
    expect(ageRangeLabel(null, null)).toBeNull();
    expect(ageRangeLabel(4, null)).toBe('Ages 4+');
  });
});

describe('rules', () => {
  it('validates fields', () => {
    expect(schoolFieldsProblem({ name: ' ' })).toMatch(/needs a name/);
    expect(schoolFieldsProblem({ urn: '12ab' })).toMatch(/URN/);
    expect(schoolFieldsProblem({ ageFrom: 11, ageTo: 4 })).toMatch(/above/);
    expect(schoolFieldsProblem({ name: 'Oak', urn: '123456' })).toBeNull();
  });
  it('lets everyone but read-only users edit the directory', () => {
    expect(canEditSchools('caseworker')).toBe(true);
    expect(canEditSchools('read_only')).toBe(false);
  });
});
