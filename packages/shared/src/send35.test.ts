import { describe, expect, it } from 'vitest';
import type { CorpusItem } from './corpus';
import { SEND35_APPELLANT_CHECKLIST, SEND35_SECTIONS } from './config';
import {
  addCalendarMonths,
  completeSend35,
  groundDraft,
  isCivilDate,
  pastCompulsorySchoolAge,
  sendAppealDeadline,
  type Send35Output,
} from './drafting';

describe('appeal time limits', () => {
  it('adds calendar months, keeping to the end of shorter months', () => {
    expect(addCalendarMonths('2026-03-03', 2)).toBe('2026-05-03');
    expect(addCalendarMonths('2025-12-31', 2)).toBe('2026-02-28');
    expect(addCalendarMonths('2027-12-31', 2)).toBe('2028-02-29');
    expect(addCalendarMonths('2026-11-15', 1)).toBe('2026-12-15');
    expect(addCalendarMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('uses two months from the letter or one from the certificate, whichever is later', () => {
    expect(sendAppealDeadline('2026-03-03', null)).toBe('2026-05-03');
    expect(sendAppealDeadline('2026-03-03', '2026-04-20')).toBe('2026-05-20');
    expect(sendAppealDeadline('2026-03-03', '2026-03-10')).toBe('2026-05-03');
  });

  it('recognises only real dates', () => {
    expect(isCivilDate('2026-02-28')).toBe(true);
    expect(isCivilDate('2026-02-30')).toBe(false);
    expect(isCivilDate('3 March 2026')).toBe(false);
  });

  it('ends compulsory school age on 31 August of the year a child turns 16', () => {
    // Born March 2010: turns 16 in March 2026, so CSA ends 31 Aug 2026.
    expect(pastCompulsorySchoolAge('2010-03-01', '2026-08-31')).toBe(false);
    expect(pastCompulsorySchoolAge('2010-03-01', '2026-09-01')).toBe(true);
    // Born October 2010: turns 16 in Oct 2026, in the year ending Aug 2027.
    expect(pastCompulsorySchoolAge('2010-10-01', '2026-11-14')).toBe(false);
  });
});

describe('completeSend35', () => {
  const caseId = 'case-1';
  const corpus: CorpusItem[] = [
    {
      id: caseId,
      type: 'case_record',
      title: 'Case record',
      date: null,
      text: 'Client: Ann Parent',
    },
    {
      id: 'letter',
      type: 'document',
      title: 'Decision letter.pdf',
      date: '2026-10-01',
      text: 'We have decided to issue the final EHC plan.',
    },
  ];
  let n = 0;
  const newId = () => `p${(n += 1)}`;
  const output = (over: Partial<Send35Output> = {}): Send35Output => ({
    sections: [
      {
        key: 'reasons',
        paragraphs: [
          {
            text: 'I disagree with Section F because it does not specify therapy.',
            sourceIds: ['letter'],
          },
        ],
        gap: null,
      },
    ],
    decisionLetter: { date: '2026-10-01', sourceIds: ['letter'] },
    mediationCertificate: null,
    missingInformation: ['The mediation certificate'],
    ...over,
  });
  const detail = {
    id: caseId,
    child: {
      id: 'c',
      fullName: 'Sam Child',
      preferredName: null,
      dateOfBirth: '2016-05-04',
      schoolYear: null,
      currentSchoolName: null,
      currentSchoolAddress: null,
      desiredSchool: null,
      sendNeeds: null,
      la: null,
      laContacts: [],
    },
    client: {
      id: 'p',
      fullName: 'Ann Parent',
      displayName: 'Ann Parent',
      preferredName: null,
      email: 'ann@example.org',
      phone: null,
      mobile: '07700 900000',
      otherContact: null,
      streetAddress: '1 High Street',
      city: 'Leeds',
      county: null,
      postcode: 'LS1 1AA',
      additionalNeeds: null,
      consentDataProcessing: true,
      consentInformationSharing: true,
      consentContact: true,
      consentPrivacyNotice: true,
      paymentPlanRequired: false,
    },
  };
  const build = (out: Send35Output, today: string) =>
    completeSend35({
      grounded: groundDraft(out, corpus, newId, SEND35_SECTIONS),
      output: out,
      detail,
      corpus,
      today,
      newId,
    });

  it('copies the child and appellant from the record, citing it, and lists what is missing', () => {
    const d = build(output(), '2026-11-14');
    expect(d.sections.map((s) => s.key)).toEqual(
      SEND35_SECTIONS.map((s) => s.key),
    );
    const child = d.sections.find((s) => s.key === 'child')!;
    expect(child.paragraphs.map((p) => p.text)).toEqual([
      'Name: Sam Child (enter as first and last name)',
      'Date of birth: 4 May 2016',
    ]);
    expect(child.paragraphs.every((p) => p.sourceIds[0] === caseId)).toBe(true);
    expect(child.gap).toMatch(/gender/);
    const appellant = d.sections.find((s) => s.key === 'appellant')!;
    const texts = appellant.paragraphs.map((p) => p.text);
    expect(texts[0]).toMatch(/on behalf of the child as a parent or carer/);
    expect(texts).toContain('Phone number: 07700 900000');
    expect(texts).toContain('Address: 1 High Street, Leeds, LS1 1AA');
    expect(appellant.gap).toMatch(/relationship/);
    expect(d.sources.map((s) => s.id)).toEqual([caseId, 'letter']);
    expect(d.missingInformation).toEqual([
      'The mediation certificate',
      ...SEND35_APPELLANT_CHECKLIST,
    ]);
  });

  it('reports the decision date and the time limit, and warns when it is close or past', () => {
    const soon = build(output(), '2026-11-25');
    const timing = soon.sections.find((s) => s.key === 'timing')!;
    expect(timing.paragraphs[0]!.text).toBe(
      '13.1 Date on the local authority decision letter: 1 Oct 2026.',
    );
    expect(timing.gap).toMatch(/1 Dec 2026/);
    expect(soon.alerts).toEqual([
      expect.stringMatching(/by 1 Dec 2026 — 6 days from now/),
    ]);
    expect(build(output(), '2026-11-01').alerts).toEqual([]);
    expect(build(output(), '2026-12-02').alerts[0]).toMatch(/has passed/);
  });

  it('drops a date that is malformed or cites nothing in the file', () => {
    const d = build(
      output({
        decisionLetter: { date: '2026-10-01', sourceIds: ['invented'] },
        mediationCertificate: { date: 'October', sourceIds: ['letter'] },
      }),
      '2026-11-14',
    );
    const timing = d.sections.find((s) => s.key === 'timing')!;
    expect(timing.paragraphs).toEqual([]);
    expect(timing.gap).toMatch(/decision letter was not found/);
    expect(d.removedUnsupported).toBe(2);
    expect(d.alerts).toEqual([]);
  });

  it('leaves question 2.1 to the family for a young person past school age', () => {
    const d = completeSend35({
      grounded: groundDraft(output(), corpus, newId, SEND35_SECTIONS),
      output: output(),
      detail: {
        ...detail,
        child: { ...detail.child, dateOfBirth: '2008-01-01' },
      },
      corpus,
      today: '2026-11-14',
      newId,
    });
    const appellant = d.sections.find((s) => s.key === 'appellant')!;
    expect(appellant.paragraphs[0]!.text).toMatch(/^Name: Ann Parent/);
    expect(appellant.gap).toMatch(/over compulsory school age/);
  });
});
