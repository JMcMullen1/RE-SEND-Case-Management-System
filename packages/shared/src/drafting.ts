/**
 * drafting.ts — assisted drafting: the structured output the model returns, the
 * draft a caseworker reviews, and the grounding rule that makes the drafting
 * safe to use: every passage must rest on items actually in the case file.
 *
 * The model is an assistant to a professional. Nothing it writes is filed,
 * sent or saved until a caseworker has read, edited and approved it.
 */

import { z } from 'zod';
import {
  COMPULSORY_SCHOOL_AGE_ENDS_AT,
  DRAFTING_ROLES,
  POSITION_STATEMENT_SECTIONS,
  POSITION_STATEMENT_SECTION_KEYS,
  SEND35_MODEL_SECTION_KEYS,
  SEND7_NOTICE_WORKING_DAYS,
  SEND_APPEAL_DEADLINE_WARNING_DAYS,
  SEND_APPEAL_MONTHS_FROM_DECISION_LETTER,
  SEND_APPEAL_MONTHS_FROM_MEDIATION_CERTIFICATE,
  SEND_TRIBUNAL_AGE_LIMIT,
  TRIBUNAL_FORMS,
  type CorpusItemType,
  type DraftKind,
  type DraftStatus,
  type TribunalFormKind,
} from './config';
import type { CorpusItem } from './corpus';
import type { CaseDetail } from './case-detail';
import { calculateAge } from './case-detail';
import { calendarDaysBetween, formatCivilDate } from './case-list';
import {
  addCalendarDays,
  addWorkingDays,
  isWorkingDay,
  snapshotHolidays,
  type Holidays,
} from './working-days';

// --- What the model returns ----------------------------------------------------

export const DraftOutputParagraphSchema = z.object({
  /** The paragraph, in plain prose, as it would appear in the statement. */
  text: z.string(),
  /**
   * The ids of the case-file items (as given in the file) this paragraph
   * rests on. Every paragraph needs at least one.
   */
  sourceIds: z.array(z.string()),
});

export const PositionStatementOutputSchema = z.object({
  sections: z.array(
    z.object({
      key: z.enum(POSITION_STATEMENT_SECTION_KEYS),
      paragraphs: z.array(DraftOutputParagraphSchema),
      /**
       * When the file gives no basis for the section (or part of it): what is
       * missing, in one or two sentences. Null when the section is covered.
       */
      gap: z.string().nullable(),
    }),
  ),
  /** Information a caseworker should obtain to complete the statement. */
  missingInformation: z.array(z.string()),
});
export type PositionStatementOutput = z.infer<
  typeof PositionStatementOutputSchema
>;

/** A date the model found in the file, with the items it was found in. */
const DatedFactSchema = z.object({
  /** As YYYY-MM-DD. */
  date: z.string(),
  sourceIds: z.array(z.string()),
});

/** The model's answers to the SEND35 form's narrative questions. */
export const Send35OutputSchema = z.object({
  sections: z.array(
    z.object({
      key: z.enum(SEND35_MODEL_SECTION_KEYS),
      paragraphs: z.array(DraftOutputParagraphSchema),
      gap: z.string().nullable(),
    }),
  ),
  /** The date printed on the local authority's decision letter, if the file has it. */
  decisionLetter: DatedFactSchema.nullable(),
  /** The date printed on the mediation certificate, if the file has one. */
  mediationCertificate: DatedFactSchema.nullable(),
  missingInformation: z.array(z.string()),
});
export type Send35Output = z.infer<typeof Send35OutputSchema>;

/** What any drafting job returns: sections of cited paragraphs, and what is missing. */
export interface DraftModelOutput {
  sections: readonly {
    key: string;
    paragraphs: readonly { text: string; sourceIds: readonly string[] }[];
    gap: string | null;
  }[];
  missingInformation: readonly string[];
}

// --- The draft a caseworker reviews --------------------------------------------

export interface DraftParagraph {
  id: string;
  text: string;
  sourceIds: string[];
  /** Changed by a caseworker since the model wrote it. */
  edited: boolean;
}

export interface DraftSection {
  /** One of the kind's section keys (see DRAFT_KIND_SECTIONS). */
  key: string;
  heading: string;
  paragraphs: DraftParagraph[];
  /** What the file did not support, as the model reported it. */
  gap: string | null;
}

/** A case-file item a draft cites, so the reviewer can check it. */
export interface DraftSource {
  id: string;
  type: CorpusItemType;
  title: string;
  date: string | null;
  /** The start of the item's text, for a quick check without opening it. */
  excerpt: string;
}

export interface Draft {
  id: string;
  caseId: string;
  kind: DraftKind;
  status: DraftStatus;
  /** What the caseworker asked the draft to focus on, if anything. */
  instructions: string | null;
  sections: DraftSection[];
  missingInformation: string[];
  sources: DraftSource[];
  /** Passages the model wrote that cited nothing in the file, and were removed. */
  removedUnsupported: number;
  /** Warnings to read first (e.g. an appeal deadline that has passed). */
  alerts: string[];
  failureReason: string | null;
  createdByName: string | null;
  createdAt: string;
  /** Last change, sent back with edits so one person's save never silently overwrites another's. */
  updatedAt: string;
  approvedByName: string | null;
  approvedAt: string | null;
  /** The case document filed on approval. */
  documentId: string | null;
}

/** Whether a role may request, edit and approve drafts. */
export function canDraft(role: string | undefined): boolean {
  return (DRAFTING_ROLES as readonly string[]).includes(role ?? '');
}

// --- Grounding -------------------------------------------------------------------

const EXCERPT_CHARS = 280;

export interface GroundedDraft {
  sections: DraftSection[];
  missingInformation: string[];
  sources: DraftSource[];
  removedUnsupported: number;
  alerts?: string[];
  /** Forms only: the dates the form's timing is worked out from. */
  formTiming?: FormTiming | null;
  /** @deprecated How SEND35 drafts stored their dates before forms were generic. */
  send35Timing?: Send35Timing;
}

/** What groundDraft says of a section the file gave no basis for. */
const NO_BASIS_GAP = 'Nothing in the case file supported this section.';

function toSource(item: CorpusItem): DraftSource {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    date: item.date,
    excerpt:
      item.text.length > EXCERPT_CHARS
        ? `${item.text.slice(0, EXCERPT_CHARS).trimEnd()}…`
        : item.text,
  };
}

/**
 * Hold the model's output to the case file. A citation is kept only if it
 * names an item actually in the file; a paragraph left with no valid citation
 * is removed (and counted) rather than shown as if it were supported. Sections
 * come back in the statement's order, every section present, so an empty one
 * is visibly empty. `newId` gives each paragraph a stable id for editing.
 */
export function groundDraft(
  output: DraftModelOutput,
  corpus: readonly CorpusItem[],
  newId: () => string,
  sectionDefs: readonly {
    key: string;
    heading: string;
  }[] = POSITION_STATEMENT_SECTIONS,
): GroundedDraft {
  const byId = new Map(corpus.map((item) => [item.id, item]));
  const cited = new Set<string>();
  let removed = 0;

  const sections: DraftSection[] = sectionDefs.map((def) => {
    const fromModel = output.sections.filter((s) => s.key === def.key);
    const paragraphs: DraftParagraph[] = [];
    const gaps: string[] = [];
    for (const section of fromModel) {
      if (section.gap?.trim()) gaps.push(section.gap.trim());
      for (const p of section.paragraphs) {
        const text = p.text.trim();
        if (!text) continue;
        const sourceIds = [...new Set(p.sourceIds)].filter((id) =>
          byId.has(id),
        );
        if (sourceIds.length === 0) {
          removed += 1;
          continue;
        }
        sourceIds.forEach((id) => cited.add(id));
        paragraphs.push({ id: newId(), text, sourceIds, edited: false });
      }
    }
    return {
      key: def.key,
      heading: def.heading,
      paragraphs,
      gap:
        gaps.join(' ') ||
        (paragraphs.length === 0
          ? 'Nothing in the case file supported this section.'
          : null),
    };
  });

  const sources: DraftSource[] = corpus
    .filter((item) => cited.has(item.id))
    .map(toSource);

  return {
    sections,
    missingInformation: output.missingInformation
      .map((m) => m.trim())
      .filter(Boolean),
    sources,
    removedUnsupported: removed,
  };
}

/** The approved statement as plain text: headings and paragraphs, no citations. */
export function draftPlainText(
  title: string,
  sections: readonly DraftSection[],
): string {
  const parts = [title, ''];
  for (const s of sections) {
    if (s.paragraphs.length === 0) continue;
    parts.push(s.heading, '');
    for (const p of s.paragraphs) parts.push(p.text, '');
  }
  return parts.join('\n').trim();
}

// --- SEND35 appeal form ------------------------------------------------------------

/** Add whole calendar months to a YYYY-MM-DD date (31 Jan + 1 month = 28/29 Feb). */
export function addCalendarMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const index = y! * 12 + (m! - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(d!, last);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** A real calendar date written as YYYY-MM-DD. */
export function isCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m! - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * The last day to appeal: two months from the date on the decision letter, or
 * one month from the date on the mediation certificate, whichever is later. A
 * limit that ends on a weekend or bank holiday runs to the next working day
 * (Tribunal Procedure Rules, rule 12(2)).
 */
export function sendAppealDeadline(
  decisionLetter: string,
  mediationCertificate: string | null,
  holidays: Holidays = snapshotHolidays(),
): string {
  let day = calendarLimit(decisionLetter, mediationCertificate);
  while (!isWorkingDay(day, holidays)) day = addCalendarDays(day, 1).date;
  return day;
}

function calendarLimit(
  decisionLetter: string,
  mediationCertificate: string | null,
): string {
  const fromDecision = addCalendarMonths(
    decisionLetter,
    SEND_APPEAL_MONTHS_FROM_DECISION_LETTER,
  );
  if (!mediationCertificate) return fromDecision;
  const fromCertificate = addCalendarMonths(
    mediationCertificate,
    SEND_APPEAL_MONTHS_FROM_MEDIATION_CERTIFICATE,
  );
  return fromCertificate > fromDecision ? fromCertificate : fromDecision;
}

/**
 * Whether a young person is past compulsory school age on `today`. It ends on
 * the school leaving date — the last Friday in June — of the school year
 * (1 September to 31 August) in which they turn 16 (Education Act 1996, s8).
 */
export function pastCompulsorySchoolAge(dob: string, today: string): boolean {
  const [y, m] = dob.split('-').map(Number);
  const birthdayYear = y! + COMPULSORY_SCHOOL_AGE_ENDS_AT;
  const endYear = m! >= 9 ? birthdayYear + 1 : birthdayYear;
  const june30 = new Date(Date.UTC(endYear, 5, 30));
  // Back from 30 June to the Friday (getUTCDay: 5 = Friday).
  const back = (june30.getUTCDay() - 5 + 7) % 7;
  return today > `${endYear}-06-${String(30 - back).padStart(2, '0')}`;
}

function joinPresent(parts: readonly (string | null | undefined)[]): string {
  return parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ');
}

/** A date a form depends on, and the draft paragraph that reports it. */
export interface FormDate {
  date: string;
  paragraphId: string;
}
/** @deprecated The shape SEND35 drafts stored before forms were generic. */
export type Send35Date = FormDate;
/** @deprecated See FormTiming. */
export interface Send35Timing {
  decisionLetter: FormDate | null;
  mediationCertificate: FormDate | null;
}

/** What a form's dates decide, kept on the draft and worked out when read. */
export type FormTiming =
  | {
      rule: 'appeal';
      /** The section the time-limit note is shown in. */
      section: string;
      /** Where the form asks for the reasons an appeal is late. */
      lateQuestion: string;
      dates: Record<string, FormDate | null>;
    }
  | { rule: 'notice'; section: string; dates: Record<string, FormDate | null> };

/** A date the model found, with the items it was found in. */
export interface DatedFact {
  date: string;
  sourceIds: readonly string[];
}

/** The id of the source that shows what was copied from the case record. */
export function recordFactsSourceId(caseId: string): string {
  return `record-facts:${caseId}`;
}

/** The model's answers to a form other than SEND35 (whose dates sit at the top level). */
export function tribunalFormOutputSchema(kind: TribunalFormKind) {
  const form = TRIBUNAL_FORMS[kind];
  const keys = form.sections
    .filter((s) => s.fill === 'model')
    .map((s) => s.key) as [string, ...string[]];
  return z.object({
    sections: z.array(
      z.object({
        key: z.enum(keys),
        paragraphs: z.array(DraftOutputParagraphSchema),
        gap: z.string().nullable(),
      }),
    ),
    ...(form.dates.length > 0
      ? {
          dates: z.object(
            Object.fromEntries(
              form.dates.map((d) => [d.key, DatedFactSchema.nullable()]),
            ),
          ),
        }
      : {}),
    missingInformation: z.array(z.string()),
  });
}
export interface TribunalFormOutput extends DraftModelOutput {
  dates?: Record<string, DatedFact | null>;
}

/** The next key date on or after `today` that matches, else null. */
function nextKeyDate(
  keyDates: CaseDetail['keyDates'],
  today: string,
  match: (k: CaseDetail['keyDates'][number]) => boolean,
) {
  return (
    keyDates
      .filter((k) => match(k) && k.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  );
}

/**
 * Turn the model's grounded answers to a Tribunal form into the full draft.
 * The factual sections are written by the system from the case record — a
 * name, birth date, address, appeal number or hearing date is copied, never
 * paraphrased — and cite a source that lists exactly what was copied. Dates
 * the model found (each held to its sources) are reported in the form's dates
 * section and kept, so what they decide — the appeal time limit, or when a
 * request can be sent — is worked out afresh whenever the draft is read (see
 * `reviewFormTiming`). The form's own checklist is added.
 */
export function completeTribunalForm(
  kind: TribunalFormKind,
  input: {
    grounded: GroundedDraft;
    dates: Record<string, DatedFact | null | undefined>;
    detail: Pick<CaseDetail, 'id' | 'child' | 'client'> &
      Partial<Pick<CaseDetail, 'appealNumber' | 'keyDates'>>;
    corpus: readonly CorpusItem[];
    today: string;
    newId: () => string;
  },
): GroundedDraft & { alerts: string[]; formTiming: FormTiming | null } {
  const { grounded, detail, corpus, today, newId } = input;
  const form = TRIBUNAL_FORMS[kind];
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const alerts: string[] = [...(grounded.alerts ?? [])];
  let removed = grounded.removedUnsupported;
  const cited = new Set(grounded.sources.map((s) => s.id));
  const factsId = recordFactsSourceId(detail.id);
  const copied: string[] = [];

  const para = (text: string, sourceIds: string[]): DraftParagraph => {
    sourceIds.forEach((id) => cited.add(id));
    return { id: newId(), text, sourceIds, edited: false };
  };
  // A fact copied from the case record, listed in the record-facts source.
  const fact = (label: string, value: string | null | undefined, note = '') => {
    if (!value?.trim()) return null;
    copied.push(`${label}: ${value.trim()}`);
    return para(`${label}: ${value.trim()}${note}`, [factsId]);
  };
  /** Something the system suggests from the record, for the family to confirm. */
  const suggestion = (text: string) => para(text, [factsId]);
  const present = <T>(xs: (T | null)[]) => xs.filter((x): x is T => x !== null);
  const notRecorded = (labels: string[], then = 'Ask the family.') =>
    labels.length
      ? `Not on the case record: ${labels.join(', ')}. ${then}`
      : null;

  const child = detail.child;
  const client = detail.client;
  const dob = child?.dateOfBirth ?? null;
  const age = dob ? calculateAge(dob, today) : null;
  if (
    age !== null &&
    age >= SEND_TRIBUNAL_AGE_LIMIT &&
    kind !== 'send7_request' &&
    kind !== 'send45_case_review'
  )
    alerts.push(
      `${child?.fullName ?? 'The young person'} is ${age}. The Tribunal hears appeals only for young people under ${SEND_TRIBUNAL_AGE_LIMIT}.`,
    );

  // --- Sections written from the case record -------------------------------
  const record: Record<
    string,
    { paragraphs: DraftParagraph[]; gap: string | null }
  > = {};

  // The child or young person.
  {
    const paragraphs = present([
      kind === 'send35a_appeal' && age !== null && age < SEND_TRIBUNAL_AGE_LIMIT
        ? suggestion(
            `The appeal is about: ${age < 16 ? 'A child under 16 years old' : 'A young person aged 16 or over and under 25 years old'}. (Worked out from the date of birth.)`,
          )
        : null,
      fact('Name', child?.fullName, ' (enter as first and last name)'),
      fact(
        'Date of birth',
        child?.dateOfBirth ? formatCivilDate(child.dateOfBirth) : null,
      ),
    ]);
    record.child = {
      paragraphs,
      gap: notRecorded([
        ...(child?.fullName ? [] : ['name']),
        'gender',
        ...(child?.dateOfBirth ? [] : ['date of birth']),
      ]),
    };
  }

  // The person appealing.
  {
    const paragraphs: DraftParagraph[] = [];
    let whoGap: string | null = null;
    if (dob && age !== null) {
      if (kind === 'send35a_appeal') {
        if (age < 16)
          paragraphs.push(
            suggestion(
              'Who is making the appeal: Parent or other – on behalf of a child under 16 years old. (Suggested from the child’s age — confirm with the family.)',
            ),
          );
        else
          whoGap =
            'The young person is 16 or over, so they appeal themselves; an Alternative Person appeals in their best interests only if they lack the capacity to. Decide who is making the appeal with the family.';
      } else if (pastCompulsorySchoolAge(dob, today))
        whoGap =
          'The young person is over compulsory school age, so they may appeal themselves; a parent appeals for them as the “alternative person” only if they cannot. Decide question 2.1 with the family.';
      else
        paragraphs.push(
          suggestion(
            '2.1 Who is making the appeal: I’m appealing on behalf of the child as a parent or carer. (Suggested because the child is of compulsory school age — confirm with the family.)',
          ),
        );
    }
    const address = client
      ? joinPresent([
          client.streetAddress,
          client.city,
          client.county,
          client.postcode,
        ])
      : '';
    paragraphs.push(
      ...present([
        fact('Name', client?.fullName, ' (enter title, first and last name)'),
        fact('Phone number', client?.mobile || client?.phone),
        fact('Email address', client?.email),
        fact('Address', address || null),
      ]),
    );
    record.appellant = {
      paragraphs,
      gap:
        [
          whoGap,
          notRecorded([
            ...(client?.fullName ? [] : ['the appellant’s name']),
            'title',
            'relationship to the child or young person',
            ...(client?.mobile || client?.phone ? [] : ['phone number']),
            ...(client?.email ? [] : ['email address']),
            ...(client?.postcode ? [] : ['full postal address']),
            ...(dob
              ? []
              : ['the child’s date of birth (needed to say who is appealing)']),
          ]),
        ]
          .filter(Boolean)
          .join(' ') || null,
    };
  }

  // Case details for forms used once an appeal is registered.
  {
    const keyDates = detail.keyDates ?? [];
    const hearing =
      kind === 'send7_request'
        ? nextKeyDate(keyDates, today, (k) => k.type === 'hearing')
        : null;
    const bundle =
      kind === 'send45_case_review'
        ? nextKeyDate(keyDates, today, (k) => /bundle/i.test(k.title))
        : null;
    const paragraphs = present([
      fact('Child or young person’s name', child?.fullName),
      fact('Appeal number', detail.appealNumber),
      kind === 'send7_request' ? fact('Local authority', child?.la) : null,
      hearing
        ? fact('Final hearing date', formatCivilDate(hearing.date))
        : null,
      bundle
        ? fact(
            'Send this form by the bundle deadline',
            `${formatCivilDate(bundle.date)} (key date “${bundle.title}”)`,
          )
        : null,
    ]);
    record.details = {
      paragraphs,
      gap: notRecorded(
        [
          ...(child?.fullName ? [] : ['the child or young person’s name']),
          ...(detail.appealNumber ? [] : ['the appeal number']),
          ...(kind === 'send7_request' && !child?.la
            ? ['the local authority']
            : []),
          ...(kind === 'send7_request' && !hearing
            ? ['an upcoming final hearing date (add it as a key date)']
            : []),
          ...(kind === 'send45_case_review' && !bundle
            ? [
                'the bundle deadline (in the case directions; add it as a key date)',
              ]
            : []),
        ],
        'Add it to the case, or fill it in on the form.',
      ),
    };
  }

  // --- The dates, each held to the items the model found it in --------------
  const dateParas: DraftParagraph[] = [];
  const timingDates: Record<string, FormDate | null> = {};
  for (const def of form.dates) {
    timingDates[def.key] = null;
    const found = input.dates[def.key];
    if (!found) continue;
    const sourceIds = [...new Set(found.sourceIds)].filter((id) =>
      byId.has(id),
    );
    if (!isCivilDate(found.date) || sourceIds.length === 0) {
      removed += 1;
      continue;
    }
    const p = para(`${def.label}: ${formatCivilDate(found.date)}.`, sourceIds);
    timingDates[def.key] = { date: found.date, paragraphId: p.id };
    dateParas.push(p);
  }
  // SEND35A asks which local authority made the decision, beside its date.
  const laFact =
    kind === 'send35a_appeal'
      ? fact('Local authority that made the decision', child?.la)
      : null;

  const sections: DraftSection[] = form.sections.map((def) => {
    const fromModel = grounded.sections.find((s) => s.key === def.key);
    if (def.fill === 'record') {
      const built = record[def.key] ?? { paragraphs: [], gap: null };
      const extra = def.key === form.datesSection ? dateParas : [];
      return {
        key: def.key,
        heading: def.heading,
        paragraphs: [...built.paragraphs, ...extra],
        gap: built.gap,
      };
    }
    const model = fromModel?.paragraphs ?? [];
    if (def.key === form.datesSection) {
      // An optional "why late" answer left empty is not a gap.
      const modelGap =
        model.length === 0 && fromModel?.gap === NO_BASIS_GAP
          ? null
          : (fromModel?.gap ?? null);
      return {
        key: def.key,
        heading: def.heading,
        paragraphs: [...(laFact ? [laFact] : []), ...dateParas, ...model],
        gap:
          [
            kind === 'send35a_appeal' && !laFact
              ? notRecorded(['the local authority'], 'Add it to the case.')
              : null,
            modelGap,
          ]
            .filter(Boolean)
            .join(' ') || null,
      };
    }
    return (
      fromModel ?? {
        key: def.key,
        heading: def.heading,
        paragraphs: [],
        gap: NO_BASIS_GAP,
      }
    );
  });

  const sources: DraftSource[] = [];
  if (cited.has(factsId))
    sources.push({
      id: factsId,
      type: 'case_record',
      title: 'Case record — copied by the system',
      date: null,
      excerpt:
        copied.length > 0
          ? copied.join('\n')
          : 'The child’s date of birth (to say who is appealing).',
    });
  sources.push(...corpus.filter((i) => cited.has(i.id)).map(toSource));

  const formTiming: FormTiming | null =
    form.timing && form.datesSection
      ? form.timing.rule === 'appeal'
        ? {
            rule: 'appeal',
            section: form.datesSection,
            lateQuestion: form.timing.lateQuestion,
            dates: timingDates,
          }
        : { rule: 'notice', section: form.datesSection, dates: timingDates }
      : null;

  return {
    sections,
    missingInformation: [...grounded.missingInformation, ...form.checklist],
    sources,
    removedUnsupported: removed,
    alerts,
    formTiming,
  };
}

/** SEND35 answers (kept for its callers): see `completeTribunalForm`. */
export function completeSend35(input: {
  grounded: GroundedDraft;
  output: Pick<Send35Output, 'decisionLetter' | 'mediationCertificate'>;
  detail: Pick<CaseDetail, 'id' | 'child' | 'client'>;
  corpus: readonly CorpusItem[];
  today: string;
  newId: () => string;
}) {
  return completeTribunalForm('send35_appeal', {
    ...input,
    dates: {
      decisionLetter: input.output.decisionLetter,
      mediationCertificate: input.output.mediationCertificate,
    },
  });
}

type Review = { alerts: string[]; note: string };

function dateState(
  d: FormDate | null | undefined,
  paragraphs: Map<string, DraftParagraph>,
) {
  if (!d) return 'absent' as const;
  const p = paragraphs.get(d.paragraphId);
  if (!p) return 'removed' as const;
  return p.edited ? ('changed' as const) : ('kept' as const);
}

/**
 * The appeal time limit, worked out on `today` from the dates a draft holds —
 * so it is right on the day the draft is read or approved, not the day it was
 * written. If a caseworker has changed or removed a date's paragraph, the
 * limit is not guessed from the old date: they are told to work it out.
 */
export function reviewSend35Timing(
  timing: Pick<Send35Timing, 'decisionLetter' | 'mediationCertificate'>,
  sections: readonly DraftSection[],
  today: string,
  holidays: Holidays = snapshotHolidays(),
  lateQuestion = 'Question 13.3',
): Review {
  const paragraphs = new Map(
    sections.flatMap((s) => s.paragraphs).map((p) => [p.id, p]),
  );
  const decision = dateState(timing.decisionLetter, paragraphs);
  const certificate = dateState(timing.mediationCertificate, paragraphs);
  const rule = `${SEND_APPEAL_MONTHS_FROM_DECISION_LETTER} months from the date on the decision letter, or ${SEND_APPEAL_MONTHS_FROM_MEDIATION_CERTIFICATE} month from the date on the mediation certificate, whichever is later — moved to the next working day if it ends on a weekend or bank holiday`;
  if ([decision, certificate].some((s) => s === 'changed' || s === 'removed'))
    return {
      alerts: [],
      note: `A date in this section has been changed since it was drafted, so the time limit is not worked out here. Work it out from the letters: ${rule}.`,
    };
  if (decision !== 'kept')
    return {
      alerts: [],
      note: `The date on the local authority’s decision letter was not found in the file. Add it and work out the time limit: ${rule}.`,
    };
  const deadline = sendAppealDeadline(
    timing.decisionLetter!.date,
    certificate === 'kept' ? timing.mediationCertificate!.date : null,
    holidays,
  );
  const when = formatCivilDate(deadline);
  const daysLeft = calendarDaysBetween(today, deadline);
  const alerts: string[] = [];
  if (daysLeft < 0)
    alerts.push(
      `On the dates found in the file, the time limit for this appeal was ${when}, which has passed. ${lateQuestion} must explain why the appeal is late; a tribunal judge decides whether to accept it.`,
    );
  else if (daysLeft <= SEND_APPEAL_DEADLINE_WARNING_DAYS)
    alerts.push(
      `On the dates found in the file, this appeal must reach the Tribunal by ${when} — ${daysLeft === 0 ? 'today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} from now`}.`,
    );
  return {
    alerts,
    note: `Time limit worked out from these dates: ${when} (${rule}). Check the dates against the letters themselves.`,
  };
}

/**
 * When a SEND7 request can go: the other party must have had the stated
 * number of working days to respond, unless they have already replied.
 */
function reviewNotice(
  dates: Record<string, FormDate | null>,
  sections: readonly DraftSection[],
  today: string,
  holidays: Holidays,
): Review {
  const paragraphs = new Map(
    sections.flatMap((s) => s.paragraphs).map((p) => [p.id, p]),
  );
  const told = dates.otherPartyNotified ?? null;
  const state = dateState(told, paragraphs);
  const days = SEND7_NOTICE_WORKING_DAYS;
  if (state === 'changed' || state === 'removed')
    return {
      alerts: [],
      note: `The date the local authority was told has been changed, so the earliest sending date is not worked out here: allow ${days} working days from telling them, unless they have already replied.`,
    };
  if (state === 'absent')
    return {
      alerts: [],
      note: `The file does not show when the local authority was told about this request. Tell them first: the form must include their response, or say they did not reply within ${days} working days.`,
    };
  const earliest = addWorkingDays(told!.date, days, holidays).date;
  const when = formatCivilDate(earliest);
  return {
    alerts:
      today < earliest
        ? [
            `The local authority was told on ${formatCivilDate(told!.date)}. Unless they reply sooner, this request cannot be sent before ${when} (${days} working days later).`,
          ]
        : [],
    note: `Earliest sending date worked out from this: ${when} (${days} working days after the local authority was told, skipping weekends and bank holidays), or sooner once they have replied.`,
  };
}

/** What a form's dates decide, as worked out on `today`. */
export function reviewFormTiming(
  timing: FormTiming,
  sections: readonly DraftSection[],
  today: string,
  holidays: Holidays = snapshotHolidays(),
): Review {
  return timing.rule === 'appeal'
    ? reviewSend35Timing(
        {
          decisionLetter: timing.dates.decisionLetter ?? null,
          mediationCertificate: timing.dates.mediationCertificate ?? null,
        },
        sections,
        today,
        holidays,
        timing.lateQuestion,
      )
    : reviewNotice(timing.dates, sections, today, holidays);
}

/** The timing a stored draft carries (including SEND35 drafts stored before forms were generic). */
export function storedFormTiming(
  content: Pick<GroundedDraft, 'formTiming' | 'send35Timing'> | null,
): FormTiming | null {
  if (!content) return null;
  if (content.formTiming) return content.formTiming;
  if (content.send35Timing)
    return {
      rule: 'appeal',
      section: 'timing',
      lateQuestion: 'Question 13.3',
      dates: { ...content.send35Timing },
    };
  return null;
}

/**
 * A form draft as it should be shown on `today`: the current warnings added to
 * its alerts, and the note on what the dates decide added to their section.
 */
export function withFormTiming<
  T extends { sections: DraftSection[]; alerts: string[] },
>(draft: T, timing: FormTiming | null, today: string): T {
  if (!timing) return draft;
  const review = reviewFormTiming(timing, draft.sections, today);
  return {
    ...draft,
    alerts: [...draft.alerts, ...review.alerts],
    sections: draft.sections.map((s) =>
      s.key === timing.section
        ? { ...s, gap: [review.note, s.gap].filter(Boolean).join(' ') }
        : s,
    ),
  };
}
