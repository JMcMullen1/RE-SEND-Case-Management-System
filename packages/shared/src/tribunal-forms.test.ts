import { describe, expect, it } from 'vitest';
import type { CorpusItem } from './corpus';
import { TRIBUNAL_FORMS, type TribunalFormKind } from './config';
import {
  completeTribunalForm,
  groundDraft,
  recordFactsSourceId,
  reviewFormTiming,
  tribunalFormOutputSchema,
  withFormTiming,
  type DatedFact,
  type DraftModelOutput,
} from './drafting';

// Made-up case throughout.
const caseId = 'case-9';
const facts = recordFactsSourceId(caseId);
const corpus: CorpusItem[] = [
  {
    id: caseId,
    type: 'case_record',
    title: 'Case record',
    date: null,
    text: 'Child: Sam Child',
  },
  {
    id: 'email-1',
    type: 'email',
    title: 'Email to the LA',
    date: '2026-11-02',
    text: 'We will ask for more time for the EP report.',
  },
];
const detail = {
  id: caseId,
  appealNumber: 'EH999/26/00001',
  keyDates: [
    {
      id: 'k1',
      date: '2026-12-10',
      time: null,
      title: 'Final Hearing',
      description: null,
      type: 'hearing' as const,
      source: 'manual' as const,
      confidence: null,
      sourceReference: null,
    },
    {
      id: 'k2',
      date: '2026-11-27',
      time: null,
      title: 'Case Review Form',
      description: null,
      type: 'evidence_deadline' as const,
      source: 'manual' as const,
      confidence: null,
      sourceReference: null,
    },
    {
      id: 'k3',
      date: '2026-01-05',
      time: null,
      title: 'Old hearing',
      description: null,
      type: 'hearing' as const,
      source: 'manual' as const,
      confidence: null,
      sourceReference: null,
    },
    {
      id: 'k4',
      date: '2026-11-30',
      time: null,
      title: 'Case Management Review',
      description: null,
      type: 'hearing' as const,
      source: 'directions_order' as const,
      confidence: null,
      sourceReference: null,
    },
    {
      id: 'k5',
      date: '2026-11-20',
      time: null,
      title: 'Supplementary bundle deadline',
      description: null,
      type: 'evidence_deadline' as const,
      source: 'manual' as const,
      confidence: null,
      sourceReference: null,
    },
  ],
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
    la: 'Exampleshire',
    laContacts: [],
  },
  client: {
    id: 'p',
    fullName: 'Ann Parent',
    displayName: 'Parent, Ann',
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
let n = 0;
const newId = () => `p${(n += 1)}`;

function build(
  kind: TribunalFormKind,
  output: DraftModelOutput,
  dates: Record<string, DatedFact | null> = {},
  today = '2026-11-14',
) {
  return completeTribunalForm(kind, {
    grounded: groundDraft(output, corpus, newId, TRIBUNAL_FORMS[kind].sections),
    dates,
    detail,
    corpus,
    today,
    newId,
  });
}

describe('tribunal form output schemas', () => {
  it('accept each form’s own section keys and dates, and nothing else', () => {
    const send7 = tribunalFormOutputSchema('send7_request');
    expect(
      send7.safeParse({
        sections: [{ key: 'request', paragraphs: [], gap: null }],
        dates: { otherPartyNotified: null },
        missingInformation: [],
      }).success,
    ).toBe(true);
    // Record sections are the system's to write, not the model's.
    expect(
      send7.safeParse({
        sections: [{ key: 'details', paragraphs: [], gap: null }],
        dates: { otherPartyNotified: null },
        missingInformation: [],
      }).success,
    ).toBe(false);
    expect(
      tribunalFormOutputSchema('send45_case_review').safeParse({
        sections: [{ key: 'issues', paragraphs: [], gap: null }],
        missingInformation: [],
      }).success,
    ).toBe(true);
  });
});

describe('SEND35A', () => {
  it('copies the child, appellant and local authority, and checks the time limit', () => {
    const d = build(
      'send35a_appeal',
      {
        sections: [
          {
            key: 'reasons',
            paragraphs: [{ text: 'Question one: …', sourceIds: ['email-1'] }],
            gap: null,
          },
        ],
        missingInformation: [],
      },
      {
        decisionLetter: { date: '2026-10-01', sourceIds: ['email-1'] },
        mediationCertificate: null,
      },
    );
    const section = (k: string) => d.sections.find((s) => s.key === k)!;
    expect(section('child').paragraphs[0]!.text).toMatch(
      /A child under 16 years old/,
    );
    expect(section('appellant').paragraphs[0]!.text).toMatch(
      /Parent or other – on behalf of a child under 16/,
    );
    expect(section('decision').paragraphs.map((p) => p.text)).toEqual([
      'Local authority that made the decision: Exampleshire',
      'Date on the decision letter from the local authority: 1 Oct 2026.',
    ]);
    expect(d.formTiming).toMatchObject({ rule: 'appeal', section: 'decision' });
    const late = reviewFormTiming(d.formTiming!, d.sections, '2026-12-05');
    expect(late.alerts[0]).toMatch(/has passed\. Section 3/);
    expect(d.missingInformation.join(' ')).toMatch(/Section 8 checklist/);
  });
});

describe('SEND7', () => {
  const output: DraftModelOutput = {
    sections: [
      {
        key: 'request',
        paragraphs: [
          {
            text: 'An extension of time to comply with a direction.',
            sourceIds: ['email-1'],
          },
        ],
        gap: null,
      },
    ],
    missingInformation: [],
  };
  it('copies the case details, including the next hearing, from the record', () => {
    const d = build('send7_request', output);
    const details = d.sections.find((s) => s.key === 'details')!;
    expect(details.paragraphs.map((p) => p.text)).toEqual([
      'Child or young person’s name: Sam Child',
      'Appeal number: EH999/26/00001',
      'Local authority: Exampleshire',
      // The CMR on 30 Nov is a hearing, but not the final one.
      'Final hearing date: 10 Dec 2026 (key date “Final Hearing”)',
    ]);
    expect(details.paragraphs.every((p) => p.sourceIds[0] === facts)).toBe(
      true,
    );
    // No response from the LA in the file: the section says so.
    expect(d.sections.find((s) => s.key === 'other_party')!.gap).toMatch(
      /Nothing in the case file/,
    );
  });

  it('works out when the request can be sent, and keeps it current', () => {
    const d = build('send7_request', output, {
      otherPartyNotified: { date: '2026-11-02', sourceIds: ['email-1'] },
    });
    const shown = (today: string) =>
      withFormTiming(
        { sections: d.sections, alerts: d.alerts },
        d.formTiming!,
        today,
      );
    // Told Monday 2 November: the LA has to Monday 9th, so it goes from the 10th.
    expect(shown('2026-11-09').alerts[0]).toMatch(
      /has until 9 Nov 2026 to respond .*on or after 10 Nov 2026/,
    );
    expect(shown('2026-11-10').alerts).toEqual([]);
    expect(
      shown('2026-11-10').sections.find((s) => s.key === 'details')!.gap,
    ).toMatch(/Earliest sending date worked out from this: 10 Nov 2026/);
    // Without the date, the caseworker is told to tell the LA first.
    const none = build('send7_request', output);
    expect(
      reviewFormTiming(none.formTiming!, none.sections, '2026-11-14').note,
    ).toMatch(/does not show when the local authority was told/);
  });
});

describe('SEND45', () => {
  it('copies the appeal number and the bundle deadline, with no timing rule', () => {
    const d = build('send45_case_review', {
      sections: [
        {
          key: 'issues',
          paragraphs: [
            {
              text: 'Section F hours remain in dispute.',
              sourceIds: ['email-1'],
            },
          ],
          gap: null,
        },
      ],
      missingInformation: [],
    });
    expect(d.sections.map((s) => s.key)).toEqual(
      TRIBUNAL_FORMS.send45_case_review.sections.map((s) => s.key),
    );
    const details = d.sections.find((s) => s.key === 'details')!;
    expect(details.paragraphs.map((p) => p.text)).toContain(
      // The case review form date, not the supplementary bundle.
      'Send this form by: 27 Nov 2026 (key date “Case Review Form”)',
    );
    expect(d.formTiming).toBeNull();
    expect(d.missingInformation.join(' ')).toMatch(/Question 16/);
  });
});

describe('SEND35A: who the appeal is about, and mediation', () => {
  const output: DraftModelOutput = { sections: [], missingInformation: [] };
  it('treats a 16-year-old still of compulsory school age as a child', () => {
    const d = completeTribunalForm('send35a_appeal', {
      grounded: groundDraft(
        output,
        corpus,
        newId,
        TRIBUNAL_FORMS.send35a_appeal.sections,
      ),
      dates: {},
      detail: {
        ...detail,
        child: { ...detail.child, dateOfBirth: '2010-03-01' },
      },
      corpus,
      today: '2026-05-01',
      newId,
    });
    const section = (k: string) => d.sections.find((s) => s.key === k)!;
    expect(section('child').paragraphs[0]!.text).toMatch(
      /still of compulsory school age/,
    );
    expect(section('appellant').paragraphs[0]!.text).toMatch(/Parent or other/);
    // No certificate in the file: said plainly.
    expect(section('decision').gap).toMatch(
      /No mediation certificate was found/,
    );
  });

  it('reports a passed due date as passed, not missing', () => {
    const d = completeTribunalForm('send45_case_review', {
      grounded: groundDraft(
        output,
        corpus,
        newId,
        TRIBUNAL_FORMS.send45_case_review.sections,
      ),
      dates: {},
      detail,
      corpus,
      today: '2026-12-01',
      newId,
    });
    expect(d.sections[0]!.paragraphs.map((p) => p.text)).toContain(
      'Send this form by: 27 Nov 2026 (key date “Case Review Form”) — this date has passed',
    );
  });
});

describe('every Tribunal form in the registry', () => {
  const kinds = Object.keys(TRIBUNAL_FORMS) as TribunalFormKind[];
  it.each(kinds)('%s is consistent and drafts end to end', (kind) => {
    const form = TRIBUNAL_FORMS[kind];
    const keys = form.sections.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of form.sections)
      if (s.fill === 'record')
        expect(['child', 'appellant', 'details']).toContain(s.builder ?? s.key);
    if (form.dates.length) expect(keys).toContain(form.datesSection);
    const dateKeys = form.dates.map((d) => d.key);
    if (form.timing?.rule === 'limit') {
      const from =
        typeof form.timing.from === 'string'
          ? [form.timing.from]
          : form.timing.from;
      for (const f of from) expect([...dateKeys, 'hearing']).toContain(f);
    }
    if (form.timing?.rule === 'appeal')
      expect(dateKeys).toEqual(
        expect.arrayContaining(['decisionLetter', 'mediationCertificate']),
      );
    // The model's (empty) answer validates, and the draft has every section.
    const empty = {
      sections: [],
      ...(form.dates.length
        ? { dates: Object.fromEntries(dateKeys.map((k) => [k, null])) }
        : {}),
      missingInformation: [],
    };
    expect(tribunalFormOutputSchema(kind).safeParse(empty).success).toBe(true);
    const d = build(kind, empty);
    expect(d.sections.map((s) => s.key)).toEqual(keys);
    expect(d.missingInformation).toEqual([...form.checklist]);
  });
});

describe('time limits on the newer forms', () => {
  const none: DraftModelOutput = { sections: [], missingInformation: [] };
  it('SEND26A runs from the review panel decision if there is one, else the governors', () => {
    const viaGovernors = build('send26a_claim', none, {
      governorsUpheld: { date: '2026-06-01', sourceIds: ['email-1'] },
    });
    expect(
      reviewFormTiming(
        viaGovernors.formTiming!,
        viaGovernors.sections,
        '2026-11-14',
      ).note,
    ).toMatch(/1 Dec 2026/);
    const viaPanel = build('send26a_claim', none, {
      governorsUpheld: { date: '2026-06-01', sourceIds: ['email-1'] },
      irpDecision: { date: '2026-07-20', sourceIds: ['email-1'] },
    });
    expect(
      reviewFormTiming(viaPanel.formTiming!, viaPanel.sections, '2026-11-14')
        .note,
    ).toMatch(/20 Jan 2027/);
  });

  it('SEND20A is 28 days from the decision, and late after that', () => {
    const d = build('send20a_permission', none, {
      decisionSent: { date: '2026-10-01', sourceIds: ['email-1'] },
    });
    const r = reviewFormTiming(d.formTiming!, d.sections, '2026-11-14');
    expect(r.note).toMatch(/29 Oct 2026/);
    expect(r.alerts[0]).toMatch(/has passed\. Section B/);
  });

  it('SEND28 uses the appeal rule (letter or mediation certificate, whichever is later)', () => {
    const d = build('send28_appeal', none, {
      decisionLetter: { date: '2026-10-01', sourceIds: ['email-1'] },
      mediationCertificate: { date: '2026-11-10', sourceIds: ['email-1'] },
    });
    expect(
      reviewFormTiming(d.formTiming!, d.sections, '2026-11-14').note,
    ).toMatch(/10 Dec 2026/);
  });
});
