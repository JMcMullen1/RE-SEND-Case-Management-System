import { describe, expect, it } from 'vitest';
import {
  estimateTokenCount,
  renderCaseRecordText,
  serialiseCorpus,
  type CorpusItem,
} from './corpus';

const items: CorpusItem[] = [
  {
    id: 'aaa',
    type: 'case_record',
    title: 'Case record — RS-2026-1001',
    date: '2026-01-01',
    text: 'Status: Active',
  },
  {
    id: 'bbb',
    type: 'note',
    title: 'Note — Priya Nair',
    date: '2026-02-03',
    text: 'Spoke to the family.',
  },
];

describe('serialiseCorpus', () => {
  it('frames each item with its id so a model can cite it', () => {
    const out = serialiseCorpus(items);
    expect(out).toContain('id=aaa type=case_record');
    expect(out).toContain('id=bbb type=note');
    // Each item id appears in the serialisation.
    for (const item of items) expect(out).toContain(`id=${item.id}`);
    expect(out).toContain('Spoke to the family.');
  });

  it('is deterministic', () => {
    expect(serialiseCorpus(items)).toBe(serialiseCorpus(items));
  });
});

describe('estimateTokenCount', () => {
  it('is zero for empty text and grows with length', () => {
    expect(estimateTokenCount('')).toBe(0);
    const short = estimateTokenCount('one two three');
    const long = estimateTokenCount('one two three four five six seven eight');
    expect(long).toBeGreaterThan(short);
  });
});

describe('renderCaseRecordText', () => {
  it('renders present fields and omits empty ones', () => {
    const text = renderCaseRecordText({
      caseReference: 'RS-2026-1001',
      status: 'Active',
      dateOfEnquiry: '2026-01-01',
      originalQuery: null,
      currentWork: 'Annual Review',
      team: ['ISA'],
      aims: null,
      supportLevel: null,
      consultStatus: 'not_required',
      client: {
        displayName: 'Fairbanks, Farrah',
        dsplArea: null,
        additionalNeeds: null,
      },
      child: {
        fullName: 'Finn Fairbanks',
        dateOfBirth: '2020-01-10',
        schoolYear: 'Yr8',
        currentSchoolName: null,
        desiredSchool: null,
        sendNeeds: 'ASD',
      },
    });
    expect(text).toContain('Case reference: RS-2026-1001');
    expect(text).toContain('Current work: Annual Review');
    expect(text).toContain('Team: ISA');
    expect(text).toContain('Name: Finn Fairbanks');
    expect(text).toContain('SEND needs: ASD');
    // Null fields are not rendered.
    expect(text).not.toContain('Original query');
    expect(text).not.toContain('Aims');
  });
});
