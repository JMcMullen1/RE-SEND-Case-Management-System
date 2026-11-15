import { describe, expect, it } from 'vitest';
import {
  emailAddressesIn,
  matchEmailToCases,
  nameForms,
  type MatchableCase,
  type MatchableEmail,
} from './email-matching';

// Made-up families and staff only.
const STAFF = ['alex.worker@resend.example', 'enquiries@resend.example'];

function kase(
  over: Partial<MatchableCase> & { caseId: string },
): MatchableCase {
  return {
    caseReference: `RS-2026-${over.caseId.padStart(4, '0')}`,
    appealNumber: null,
    noAutoFile: false,
    clientEmails: [],
    clientNames: [],
    childNames: [],
    schoolContactEmails: [],
    laContactEmails: [],
    ...over,
  };
}

function email(over: Partial<MatchableEmail> = {}): MatchableEmail {
  return {
    subject: 'Update',
    bodyText: 'Hello, just an update.',
    fromAddress: 'someone@example.org',
    toAddresses: ['alex.worker@resend.example'],
    ccAddresses: [],
    ...over,
  };
}

const doe = kase({
  caseId: '1',
  clientEmails: ['jamie.doe@example.org'],
  clientNames: nameForms('Jamie Doe'),
  childNames: nameForms('Robin James Doe'),
});
const doeSibling = kase({
  caseId: '2',
  clientEmails: ['jamie.doe@example.org'],
  clientNames: nameForms('Jamie Doe'),
  childNames: nameForms('Sky Doe'),
});
const other = kase({
  caseId: '3',
  appealNumber: 'EH 123/26/00042',
  clientEmails: ['pat.lee@example.org'],
  clientNames: nameForms('Pat Lee'),
  childNames: nameForms('Ash Lee'),
  schoolContactEmails: ['senco@school.example'],
  laContactEmails: emailAddressesIn(
    'Sam Officer, SEN team, sam.officer@council.example',
  ),
});

describe('matching an email to a case', () => {
  it('files an email from the client of one case to that case', () => {
    const result = matchEmailToCases(
      email({ fromAddress: 'Pat.Lee@example.org' }),
      [doe, doeSibling, other],
      STAFF,
    );
    expect(result.autoFileCaseId).toBe('3');
    expect(result.matches[0]).toMatchObject({
      caseId: '3',
      reasons: ['client_email'],
    });
  });

  it('matches staff’s own emails by who they were sent to', () => {
    const result = matchEmailToCases(
      email({
        fromAddress: 'alex.worker@resend.example',
        toAddresses: ['pat.lee@example.org'],
      }),
      [doe, other],
      STAFF,
    );
    expect(result.autoFileCaseId).toBe('3');
  });

  it('asks when a parent with two children’s cases does not say which', () => {
    const result = matchEmailToCases(
      email({ fromAddress: 'jamie.doe@example.org' }),
      [doe, doeSibling, other],
      STAFF,
    );
    expect(result.autoFileCaseId).toBeNull();
    expect(result.matches.map((m) => m.caseId).sort()).toEqual(['1', '2']);
  });

  it('files to the right sibling when the email names the child', () => {
    const result = matchEmailToCases(
      email({
        fromAddress: 'jamie.doe@example.org',
        bodyText: 'About Robin Doe’s annual review next week.',
      }),
      [doe, doeSibling, other],
      STAFF,
    );
    expect(result.autoFileCaseId).toBe('1');
    expect(result.matches[0]!.reasons).toEqual(['client_email', 'child_name']);
  });

  it('recognises the case reference and the appeal number, however written', () => {
    expect(
      matchEmailToCases(
        email({ subject: 'Re: rs-2026-0001 hearing bundle' }),
        [doe, other],
        STAFF,
      ).autoFileCaseId,
    ).toBe('1');
    expect(
      matchEmailToCases(
        email({
          fromAddress: 'tribunal@justice.example',
          bodyText: 'Appeal EH123/26/00042: directions',
        }),
        [doe, other],
        STAFF,
      ).autoFileCaseId,
    ).toBe('3');
  });

  it('does not take a first name alone as the child’s name', () => {
    const result = matchEmailToCases(
      email({ bodyText: 'Robin was much happier today.' }),
      [doe],
      STAFF,
    );
    expect(result.matches).toEqual([]);
  });

  it('finds a full name across a middle name, and ignores case and punctuation', () => {
    const result = matchEmailToCases(
      email({ subject: 'ROBIN DOE – EHCP draft' }),
      [doe, other],
      STAFF,
    );
    expect(result.matches[0]).toMatchObject({
      caseId: '1',
      reasons: ['child_name'],
    });
    // A name alone is a suggestion, not enough to file without asking.
    expect(result.autoFileCaseId).toBeNull();
  });

  it('suggests a case from a school or LA contact, without filing', () => {
    const result = matchEmailToCases(
      email({ fromAddress: 'sam.officer@council.example' }),
      [doe, other],
      STAFF,
    );
    expect(result.matches[0]).toMatchObject({
      caseId: '3',
      reasons: ['la_contact'],
    });
    expect(result.autoFileCaseId).toBeNull();
  });

  it('never files to a closed case by itself, but suggests it', () => {
    const closed = { ...other, noAutoFile: true };
    const result = matchEmailToCases(
      email({ fromAddress: 'pat.lee@example.org' }),
      [doe, closed],
      STAFF,
    );
    expect(result.autoFileCaseId).toBeNull();
    expect(result.matches[0]!.caseId).toBe('3');
  });

  it('suggests nothing when nothing ties the email to a case', () => {
    const result = matchEmailToCases(email(), [doe, doeSibling, other], STAFF);
    expect(result).toEqual({ matches: [], autoFileCaseId: null });
  });
});

describe('helpers', () => {
  it('finds email addresses written in text', () => {
    expect(
      emailAddressesIn('Sam (SEN) <Sam.Officer@Council.example>; tel 0100'),
    ).toEqual(['sam.officer@council.example']);
    expect(emailAddressesIn(null)).toEqual([]);
  });

  it('gives a name with and without its middle names, and none for one word', () => {
    expect(nameForms('Robin James Doe')).toEqual([
      'robin james doe',
      'robin doe',
    ]);
    expect(nameForms('Robin')).toEqual([]);
  });
});
