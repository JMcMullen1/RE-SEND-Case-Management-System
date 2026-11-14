import { describe, expect, it } from 'vitest';
import {
  analyseCaseImport,
  matchImportHeadings,
  parseImportDate,
  type CaseImportContext,
  type CaseImportRequest,
} from './case-import';

// The charity's own case list headings (made-up data throughout).
const HEADINGS = [
  'Date of enquiry',
  'Allocated to',
  'Dealing/ Shadow',
  'Current Team',
  'Status',
  'Client Name',
  'Email',
  "Child's Name",
  'Original Query',
  'Method of enquiry',
  'Current Work',
  'Notes',
  'Payment Details',
  'Discount Code',
  'Invoice Status',
  'Phone Number',
  'Mobile Number',
  'Other',
  'Street Address',
  'City',
  'County',
  'Postcode',
  'QB Notes',
  '',
];

function row(over: Record<string, string> = {}): string[] {
  const base: Record<string, string> = {
    'Date of enquiry': '01/09/2026',
    'Allocated to': 'TSA Team',
    'Dealing/ Shadow': 'Pat',
    'Current Team': 'TSA',
    Status: 'Closed',
    'Client Name': 'Jo Example',
    Email: 'jo.example@example.org',
    "Child's Name": 'Robin',
    'Original Query': 'Appeal - Section',
    'Method of enquiry': 'Query Form',
    'Current Work': 'Section BF&I',
    Notes:
      '22/09/2026 - closed - 15/09/2026 - taking advice - 01/09/2026 - passed to TSA',
    'Payment Details': 'PM',
    'Invoice Status': 'No PP requested',
    ...over,
  };
  return HEADINGS.map((h) => base[h] ?? '');
}

const context: CaseImportContext = {
  today: '2026-11-14',
  users: [
    { id: 'u-pat', displayName: 'Pat Caseworker', active: true },
    { id: 'u-sam', displayName: 'Sam Admin', active: true },
    { id: 'u-sam2', displayName: 'Sam Other', active: true },
    { id: 'u-gone', displayName: 'Lee Leaver', active: false },
  ],
  clients: [
    {
      id: 'c-known',
      fullName: 'Kim Known',
      email: 'kim@example.org',
      postcode: 'LS1 1AA',
    },
    { id: 'c-name', fullName: 'Alex Same', email: null, postcode: null },
  ],
  children: [{ clientId: 'c-known', childId: 'ch-known', fullName: 'Ash' }],
  cases: [
    {
      caseReference: 'RS-2025-1001',
      clientName: 'Kim Known',
      childName: 'Ash',
      dateOfEnquiry: '2025-03-01',
    },
  ],
};

const request = (
  rows: string[][],
  over: Partial<CaseImportRequest> = {},
): CaseImportRequest => ({
  rows,
  firstRowNumber: 2,
  mapping: matchImportHeadings(HEADINGS),
  valueMaps: {},
  ...over,
});

describe('matchImportHeadings', () => {
  it('matches every one of the case list headings to its field', () => {
    const mapping = matchImportHeadings(HEADINGS);
    expect(mapping.slice(0, 23).every(Boolean)).toBe(true);
    expect(mapping[23]).toBeNull();
    expect(matchImportHeadings(['dealing/shadow', 'CHILDS NAME'])).toEqual([
      'dealingShadow',
      'childName',
    ]);
    // A field is matched once; a second column with the same heading is not.
    expect(matchImportHeadings(['Status', 'Status'])).toEqual(['status', null]);
  });
});

describe('parseImportDate', () => {
  it('reads UK dates and ISO dates, and refuses anything else', () => {
    expect(parseImportDate('01/09/2026')).toBe('2026-09-01');
    expect(parseImportDate('1/9/26')).toBe('2026-09-01');
    expect(parseImportDate('2026-09-01')).toBe('2026-09-01');
    expect(parseImportDate('31/02/2026')).toBeNull();
    expect(parseImportDate('September')).toBeNull();
  });
});

describe('analyseCaseImport', () => {
  it('reads a typical row into a case, matching values and staff', () => {
    const { rows, summary } = analyseCaseImport(request([row()]), context);
    const r = rows[0]!;
    expect(r.outcome).toBe('import');
    expect(r.rowNumber).toBe(2);
    expect(r.plan).toMatchObject({
      dateOfEnquiry: '2026-09-01',
      status: 'Closed',
      ownerQueue: 'TSA Team',
      ownerUserId: null,
      shadowUserId: 'u-pat',
      teams: ['TSA'],
      originalQuery: 'Appeal - Section',
      methodOfEnquiry: 'Query Form',
      currentWork: 'Section B F & I',
      paymentCode: 'PM',
      invoiceStatusText: 'No PP requested',
      client: { kind: 'new' },
      clientFields: { fullName: 'Jo Example', email: 'jo.example@example.org' },
      childFields: { fullName: 'Robin' },
      // Dated by the latest entry in the note.
      note: { date: '2026-09-22' },
    });
    expect(r.issues).toEqual([]);
    expect(summary).toMatchObject({ total: 1, toImport: 1, problems: 0 });
  });

  it('flags a row it cannot place, and lists values for a person to match', () => {
    const { rows, valuesToMatch } = analyseCaseImport(
      request([
        row({ Status: 'On hold', 'Current Work': 'Tribunal stuff' }),
        row({ 'Date of enquiry': '', 'Client Name': 'Other Person' }),
        row({ 'Client Name': '', "Child's Name": '' }),
        HEADINGS.map(() => ''),
      ]),
      context,
    );
    // The blank last row is not a case at all.
    expect(rows.map((r) => r.outcome)).toEqual([
      'problem',
      'problem',
      'problem',
    ]);
    expect(rows[0]!.issues[0]!.message).toMatch(/Status “On hold”/);
    expect(rows[1]!.issues[0]!.message).toMatch(/No date of enquiry/);
    expect(rows[2]!.issues.at(-1)!.message).toMatch(/nobody to make the case/);
    expect(valuesToMatch).toEqual(
      expect.arrayContaining([
        { field: 'status', value: 'On hold', count: 1, matchedTo: null },
        {
          field: 'currentWork',
          value: 'Tribunal stuff',
          count: 1,
          matchedTo: null,
        },
      ]),
    );
  });

  it('applies a person’s matches for unrecognised values and staff', () => {
    const { rows } = analyseCaseImport(
      request(
        [
          row({
            Status: 'On hold',
            'Allocated to': 'Sam',
            'Dealing/ Shadow': '',
          }),
        ],
        {
          valueMaps: {
            status: { 'On hold': 'Dormant' },
            allocatedTo: { Sam: 'user:u-sam' },
          },
        },
      ),
      context,
    );
    // "Sam" is two people's first name, so it needed matching by hand.
    expect(rows[0]!.plan).toMatchObject({
      status: 'Dormant',
      ownerUserId: 'u-sam',
      ownerQueue: null,
    });
  });

  it('joins an existing client only on email, or name and postcode', () => {
    const { rows, summary } = analyseCaseImport(
      request([
        row({
          'Client Name': 'Kim Known',
          Email: 'KIM@example.org',
          "Child's Name": 'Ash',
        }),
        row({
          'Client Name': 'Kim Known',
          Email: '',
          Postcode: 'ls1 1aa',
          "Child's Name": 'Bo',
        }),
        row({ 'Client Name': 'Alex Same', Email: '' }),
      ]),
      context,
    );
    expect(rows[0]!.plan!.client).toEqual({ kind: 'existing', id: 'c-known' });
    expect(rows[0]!.plan!.child).toEqual({ kind: 'existing', id: 'ch-known' });
    expect(rows[1]!.plan!.client).toEqual({ kind: 'existing', id: 'c-known' });
    expect(rows[1]!.plan!.child.kind).toBe('new');
    // A name alone is never enough.
    expect(rows[2]!.plan!.client.kind).toBe('new');
    expect(rows[2]!.issues.map((i) => i.message).join(' ')).toMatch(
      /already on the system/,
    );
    expect(summary.existingClients).toBe(2);
  });

  it('keeps siblings with one new client, and skips duplicates', () => {
    const { rows, summary } = analyseCaseImport(
      request([
        row(),
        row({ "Child's Name": 'Robin’s sister' }),
        row(),
        row({
          'Client Name': 'Kim Known',
          Email: 'kim@example.org',
          "Child's Name": 'Ash',
          'Date of enquiry': '01/03/2025',
        }),
      ]),
      context,
    );
    expect(rows[1]!.plan!.client).toEqual(rows[0]!.plan!.client);
    expect(rows[1]!.clientNote).toBe('Same new client as row 2');
    expect(rows[2]!.outcome).toBe('duplicate');
    expect(rows[2]!.issues.at(-1)!.message).toMatch(/same case as row 2/);
    expect(rows[3]!.outcome).toBe('duplicate');
    expect(rows[3]!.issues.at(-1)!.message).toMatch(/RS-2025-1001/);
    expect(summary).toMatchObject({ toImport: 2, duplicates: 2 });
  });

  it('warns about a leaver on an open case and an unreadable email', () => {
    const { rows } = analyseCaseImport(
      request([
        row({
          'Allocated to': 'Lee Leaver',
          Status: 'Active',
          Email: 'not-an-email',
        }),
      ]),
      context,
    );
    const text = rows[0]!.issues.map((i) => i.message).join(' ');
    expect(rows[0]!.outcome).toBe('import');
    expect(text).toMatch(/Lee Leaver has left/);
    expect(text).toMatch(/does not look like an email/);
    expect(rows[0]!.plan!.clientFields!.email).toBeNull();
  });
});
