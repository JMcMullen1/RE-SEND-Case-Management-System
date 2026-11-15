import { describe, expect, it } from 'vitest';
import {
  NotAGiasFile,
  decodeGiasBytes,
  localAuthorityCounts,
  planSchoolImport,
  readCsvRows,
  readGiasFile,
  type ExistingSchool,
  type ImportedSchool,
} from './school-import';

const HEADINGS = [
  'URN',
  'LA (code)',
  'LA (name)',
  'EstablishmentName',
  'TypeOfEstablishment (name)',
  'EstablishmentTypeGroup (name)',
  'EstablishmentStatus (name)',
  'StatutoryLowAge',
  'StatutoryHighAge',
  'Street',
  'Locality',
  'Address3',
  'Town',
  'County (name)',
  'Postcode',
  'SchoolWebsite',
  'TelephoneNum',
  'Section41Approved (name)',
  'TypeOfResourcedProvision (name)',
];

/** A made-up row in the DfE file's column order. */
function row(over: Partial<Record<string, string>>): string {
  const base: Record<string, string> = {
    URN: '100001',
    'LA (code)': '999',
    'LA (name)': 'Testshire',
    EstablishmentName: 'Meadow Primary School',
    'TypeOfEstablishment (name)': 'Community school',
    'EstablishmentTypeGroup (name)': 'Local authority maintained schools',
    'EstablishmentStatus (name)': 'Open',
    StatutoryLowAge: '4',
    StatutoryHighAge: '11',
    Street: '1 Meadow Road',
    Locality: '',
    Address3: '',
    Town: 'Testtown',
    'County (name)': '',
    Postcode: 'tt1 1aa',
    SchoolWebsite: 'www.meadow.example',
    TelephoneNum: '01234 567890',
    'Section41Approved (name)': 'Not applicable',
    'TypeOfResourcedProvision (name)': 'Not applicable',
    ...over,
  };
  return HEADINGS.map((h) => `"${(base[h] ?? '').replace(/"/g, '""')}"`).join(
    ',',
  );
}

function file(...rows: string[]): string {
  return [HEADINGS.map((h) => `"${h}"`).join(','), ...rows].join('\r\n');
}

describe('reading CSV', () => {
  it('handles quotes, doubled quotes, commas and line breaks in a field', () => {
    const rows: string[][] = [];
    readCsvRows('a,"b, c","say ""hi""","two\nlines"\r\nx,,z\n', (r) =>
      rows.push(r),
    );
    expect(rows).toEqual([
      ['a', 'b, c', 'say "hi"', 'two\nlines'],
      ['x', '', 'z'],
    ]);
  });

  it('reads the DfE file’s Windows-1252 text, and UTF-8 too', () => {
    // "St Mary’s" with the curly apostrophe as Windows-1252 byte 0x92.
    const cp1252 = new Uint8Array([
      0x53, 0x74, 0x20, 0x4d, 0x61, 0x72, 0x79, 0x92, 0x73,
    ]);
    expect(decodeGiasBytes(cp1252)).toBe('St Mary’s');
    const utf8 = new TextEncoder().encode('﻿St Mary’s');
    expect(decodeGiasBytes(utf8)).toBe('St Mary’s');
  });
});

describe('reading the DfE establishment file', () => {
  it('turns open schools into the directory’s fields', () => {
    const { schools } = readGiasFile(file(row({})));
    expect(schools).toEqual([
      {
        urn: '100001',
        name: 'Meadow Primary School',
        address: '1 Meadow Road, Testtown',
        postcode: 'TT1 1AA',
        localAuthority: 'Testshire',
        phone: '01234 567890',
        website: 'www.meadow.example',
        funding: 'maintained',
        provision: 'mainstream',
        section41: false,
        ageFrom: 4,
        ageTo: 11,
      },
    ]);
  });

  it('works out funding and provision from the type', () => {
    const { schools } = readGiasFile(
      file(
        row({
          URN: '100002',
          'TypeOfEstablishment (name)': 'Academy special converter',
          'EstablishmentTypeGroup (name)': 'Academies',
        }),
        row({
          URN: '100003',
          'TypeOfEstablishment (name)': 'Pupil referral unit',
        }),
        row({
          URN: '100004',
          'TypeOfResourcedProvision (name)': 'SEN unit',
        }),
        row({
          URN: '100005',
          'TypeOfEstablishment (name)': 'Other independent special school',
          'EstablishmentTypeGroup (name)': 'Special schools',
          'Section41Approved (name)': 'Approved',
        }),
        row({
          URN: '100006',
          'TypeOfEstablishment (name)': 'Further education',
          'EstablishmentTypeGroup (name)': 'Colleges',
          StatutoryLowAge: '16',
          StatutoryHighAge: '99',
        }),
      ),
    );
    expect(
      schools.map((s) => [s.urn, s.funding, s.provision, s.section41]),
    ).toEqual([
      ['100002', 'academy', 'specialist', false],
      ['100003', 'maintained', 'alternative_provision', false],
      ['100004', 'maintained', 'mainstream_resource_base', false],
      ['100005', 'independent', 'specialist', true],
      ['100006', null, 'mainstream', false],
    ]);
    // "16 to 99" reads as 16+.
    expect(schools[4]).toMatchObject({ ageFrom: 16, ageTo: null });
  });

  it('leaves out closed schools and ones abroad or in Wales, unless Section 41', () => {
    const contents = readGiasFile(
      file(
        row({ URN: '100010', 'EstablishmentStatus (name)': 'Closed' }),
        row({
          URN: '100014',
          'EstablishmentStatus (name)': 'Proposed to open',
        }),
        row({
          URN: '100011',
          'TypeOfEstablishment (name)': 'British schools overseas',
        }),
        row({
          URN: '100012',
          'TypeOfEstablishment (name)': 'Welsh establishment',
        }),
        row({
          URN: '100013',
          'TypeOfEstablishment (name)': 'Welsh establishment',
          'Section41Approved (name)': 'Approved',
        }),
        row({ URN: '', EstablishmentName: 'No URN' }),
      ),
    );
    expect(contents.schools.map((s) => s.urn)).toEqual(['100013']);
    expect(contents).toMatchObject({ closed: 2, outOfScope: 2, unreadable: 1 });
  });

  it('says plainly when a different file was chosen', () => {
    expect(() => readGiasFile('Name,Email\r\nA,b@example.org')).toThrow(
      NotAGiasFile,
    );
    expect(() => readGiasFile('')).toThrow(NotAGiasFile);
  });

  it('counts schools by local authority, A–Z', () => {
    const { schools } = readGiasFile(
      file(
        row({ URN: '100020', 'LA (name)': 'Zedshire' }),
        row({ URN: '100021' }),
        row({ URN: '100022' }),
      ),
    );
    expect(localAuthorityCounts(schools)).toEqual([
      { name: 'Testshire', count: 2 },
      { name: 'Zedshire', count: 1 },
    ]);
  });
});

describe('planning an import against the directory', () => {
  const incoming = (over: Partial<ImportedSchool> = {}): ImportedSchool => ({
    urn: '100001',
    name: 'Meadow Primary School',
    address: '1 Meadow Road, Testtown',
    postcode: 'TT1 1AA',
    localAuthority: 'Testshire',
    phone: '01234 567890',
    website: null,
    funding: 'maintained',
    provision: 'mainstream',
    section41: false,
    ageFrom: 4,
    ageTo: 11,
    ...over,
  });
  const existing = (over: Partial<ExistingSchool> = {}): ExistingSchool => ({
    id: 'e1',
    ...incoming(),
    website: 'www.kept.example',
    archived: false,
    ...over,
  });

  it('adds a school the directory does not have', () => {
    const plan = planSchoolImport([incoming()], []);
    expect(plan.create).toHaveLength(1);
  });

  it('refreshes the facts of the school with the same URN, never blanking one', () => {
    const plan = planSchoolImport(
      [incoming({ name: 'Meadow Primary Academy', funding: 'academy' })],
      [existing({ provision: 'specialist' })],
    );
    expect(plan.update).toEqual([
      {
        id: 'e1',
        urn: '100001',
        name: 'Meadow Primary Academy',
        matchedBy: 'urn',
        archived: false,
        changes: {
          name: { from: 'Meadow Primary School', to: 'Meadow Primary Academy' },
          funding: { from: 'maintained', to: 'academy' },
        },
      },
    ]);
  });

  it('counts a school whose facts already match as unchanged', () => {
    const plan = planSchoolImport([incoming()], [existing()]);
    expect(plan).toMatchObject({ create: [], update: [], unchanged: 1 });
  });

  it('fills in provision only when the directory has none', () => {
    const plan = planSchoolImport(
      [incoming()],
      [existing({ provision: null })],
    );
    expect(plan.update[0]!.changes.provision).toEqual({
      from: null,
      to: 'mainstream',
    });
  });

  it('gives a URN to the one school added by hand with the same name and postcode', () => {
    const byHand = existing({
      id: 'hand',
      urn: null,
      name: 'Meadow C of E Primary',
      postcode: null,
    });
    const plan = planSchoolImport(
      [incoming({ name: 'Meadow CE Primary School' })],
      [byHand],
    );
    expect(plan.update[0]).toMatchObject({
      id: 'hand',
      matchedBy: 'name',
      changes: { urn: { from: null, to: '100001' } },
    });
  });

  it('adds a new school when a same-named one is elsewhere, or two could match', () => {
    const elsewhere = existing({ id: 'x', urn: null, postcode: 'ZZ9 9ZZ' });
    expect(planSchoolImport([incoming()], [elsewhere]).create).toHaveLength(1);
    const twins = [
      existing({ id: 'a', urn: null, postcode: null }),
      existing({ id: 'b', urn: null, postcode: null }),
    ];
    expect(planSchoolImport([incoming()], twins).create).toHaveLength(1);
  });

  it('refreshes an archived school but keeps it archived, and prefers a live one', () => {
    const plan = planSchoolImport(
      [incoming({ phone: '09999' })],
      [existing({ id: 'old', archived: true })],
    );
    expect(plan.update[0]).toMatchObject({ id: 'old', archived: true });
    const both = planSchoolImport(
      [incoming({ phone: '09999' })],
      [existing({ id: 'old', archived: true }), existing({ id: 'live' })],
    );
    expect(both.update[0]!.id).toBe('live');
  });

  it('never matches by a name the file itself uses twice (an academy and the school it replaces)', () => {
    const byHand = existing({ id: 'hand', urn: null, postcode: 'TT1 1AA' });
    const plan = planSchoolImport(
      [incoming(), incoming({ urn: '100099', name: 'Meadow Primary' })],
      [byHand],
    );
    expect(plan.update).toEqual([]);
    expect(plan.create).toHaveLength(2);
  });

  it('never gives a URN to an archived school added by hand', () => {
    const archived = existing({ id: 'gone', urn: null, archived: true });
    const live = existing({ id: 'live', urn: null, postcode: null });
    const plan = planSchoolImport([incoming()], [archived, live]);
    expect(plan.update[0]).toMatchObject({ id: 'live', matchedBy: 'name' });
    expect(planSchoolImport([incoming()], [archived]).create).toHaveLength(1);
  });

  it('ignores the same URN sent twice', () => {
    const plan = planSchoolImport([incoming(), incoming()], []);
    expect(plan).toMatchObject({ repeated: 1 });
    expect(plan.create).toHaveLength(1);
  });
});
