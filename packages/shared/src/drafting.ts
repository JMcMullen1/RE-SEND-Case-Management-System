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
  SEND35_APPELLANT_CHECKLIST,
  SEND35_MODEL_SECTION_KEYS,
  SEND35_SECTIONS,
  SEND_APPEAL_DEADLINE_WARNING_DAYS,
  SEND_APPEAL_MONTHS_FROM_DECISION_LETTER,
  SEND_APPEAL_MONTHS_FROM_MEDIATION_CERTIFICATE,
  SEND_TRIBUNAL_AGE_LIMIT,
  type CorpusItemType,
  type DraftKind,
  type DraftStatus,
} from './config';
import type { CorpusItem } from './corpus';
import type { CaseDetail } from './case-detail';
import { calculateAge } from './case-detail';
import { calendarDaysBetween, formatCivilDate } from './case-list';
import {
  addCalendarDays,
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
  /** SEND35 only: the dates the time limit is worked out from. */
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

/** A date the time limit runs from, and the draft paragraph that reports it. */
export interface Send35Date {
  date: string;
  paragraphId: string;
}
export interface Send35Timing {
  decisionLetter: Send35Date | null;
  mediationCertificate: Send35Date | null;
}

/** The id of the source that shows what was copied from the case record. */
export function recordFactsSourceId(caseId: string): string {
  return `record-facts:${caseId}`;
}

/**
 * Turn the model's grounded SEND35 answers into the full form draft. The
 * factual sections (child, appellant) are written by the system from the case
 * record — a name, birth date or address is copied, never paraphrased — and
 * cite a source that lists exactly what was copied. The decision letter and
 * mediation certificate dates the model found (each held to its sources) are
 * reported in Section 13 and kept, so the time limit can be worked out
 * afresh whenever the draft is read (see `reviewSend35Timing`). The
 * appellant's own checklist is added.
 */
export function completeSend35(input: {
  grounded: GroundedDraft;
  output: Pick<Send35Output, 'decisionLetter' | 'mediationCertificate'>;
  detail: Pick<CaseDetail, 'id' | 'child' | 'client'>;
  corpus: readonly CorpusItem[];
  today: string;
  newId: () => string;
}): GroundedDraft & { alerts: string[]; send35Timing: Send35Timing } {
  const { grounded, output, detail, corpus, today, newId } = input;
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
  const notRecorded = (labels: string[]) =>
    labels.length
      ? `Not on the case record: ${labels.join(', ')}. Ask the family.`
      : null;

  // Section 1 — the child.
  const child = detail.child;
  const childParas = [
    fact('Name', child?.fullName, ' (enter as first and last name)'),
    fact(
      'Date of birth',
      child?.dateOfBirth ? formatCivilDate(child.dateOfBirth) : null,
    ),
  ].filter((p) => p !== null);
  const childMissing = [
    ...(child?.fullName ? [] : ['name']),
    'gender',
    ...(child?.dateOfBirth ? [] : ['date of birth']),
  ];

  // Section 2 — the person appealing.
  const client = detail.client;
  const dob = child?.dateOfBirth ?? null;
  const appellantParas: DraftParagraph[] = [];
  let whoGap: string | null = null;
  if (dob) {
    const age = calculateAge(dob, today);
    if (age !== null && age >= SEND_TRIBUNAL_AGE_LIMIT)
      alerts.push(
        `${child?.fullName ?? 'The young person'} is ${age}. The Tribunal hears appeals only for young people under ${SEND_TRIBUNAL_AGE_LIMIT}.`,
      );
    if (pastCompulsorySchoolAge(dob, today))
      whoGap =
        'The young person is over compulsory school age, so they may appeal themselves; a parent appeals for them as the “alternative person” only if they cannot. Decide question 2.1 with the family.';
    else {
      // Not a fact on the record: suggested from the child's age.
      cited.add(factsId);
      appellantParas.push(
        para(
          '2.1 Who is making the appeal: I’m appealing on behalf of the child as a parent or carer. (Suggested because the child is of compulsory school age — confirm with the family.)',
          [factsId],
        ),
      );
    }
  }
  const address = client
    ? joinPresent([
        client.streetAddress,
        client.city,
        client.county,
        client.postcode,
      ])
    : '';
  appellantParas.push(
    ...[
      fact('Name', client?.fullName, ' (enter title, first and last name)'),
      fact('Phone number', client?.mobile || client?.phone),
      fact('Email address', client?.email),
      fact('Address', address || null),
    ].filter((p) => p !== null),
  );
  const appellantMissing = [
    ...(client?.fullName ? [] : ['the appellant’s name']),
    'title',
    'relationship to the child or young person',
    ...(client?.mobile || client?.phone ? [] : ['phone number']),
    ...(client?.email ? [] : ['email address']),
    ...(client?.postcode ? [] : ['full postal address']),
    ...(dob ? [] : ['the child’s date of birth (needed to answer 2.1)']),
  ];

  // Section 13 — the dates, each held to the items the model found it in.
  const dated = (found: { date: string; sourceIds: string[] } | null) => {
    if (!found) return null;
    const sourceIds = [...new Set(found.sourceIds)].filter((id) =>
      byId.has(id),
    );
    if (!isCivilDate(found.date) || sourceIds.length === 0) {
      removed += 1;
      return null;
    }
    return { date: found.date, sourceIds };
  };
  const decision = dated(output.decisionLetter);
  const certificate = dated(output.mediationCertificate);
  const timing: Send35Timing = {
    decisionLetter: null,
    mediationCertificate: null,
  };
  const timingParas: DraftParagraph[] = [];
  if (decision) {
    const p = para(
      `13.1 Date on the local authority decision letter: ${formatCivilDate(decision.date)}.`,
      decision.sourceIds,
    );
    timing.decisionLetter = { date: decision.date, paragraphId: p.id };
    timingParas.push(p);
  }
  if (certificate) {
    const p = para(
      `13.2 Date on the mediation certificate: ${formatCivilDate(certificate.date)}.`,
      certificate.sourceIds,
    );
    timing.mediationCertificate = { date: certificate.date, paragraphId: p.id };
    timingParas.push(p);
  }

  const sections: DraftSection[] = SEND35_SECTIONS.map((def) => {
    const fromModel = grounded.sections.find((s) => s.key === def.key);
    switch (def.key) {
      case 'child':
        return {
          key: def.key,
          heading: def.heading,
          paragraphs: childParas,
          gap: notRecorded(childMissing),
        };
      case 'appellant':
        return {
          key: def.key,
          heading: def.heading,
          paragraphs: appellantParas,
          gap:
            [whoGap, notRecorded(appellantMissing)].filter(Boolean).join(' ') ||
            null,
        };
      case 'timing': {
        const late = fromModel?.paragraphs ?? [];
        // 13.3 is only for a late appeal: an empty answer is not a gap.
        const modelGap =
          late.length === 0 && fromModel?.gap === NO_BASIS_GAP
            ? null
            : (fromModel?.gap ?? null);
        return {
          key: def.key,
          heading: def.heading,
          paragraphs: [...timingParas, ...late],
          gap: modelGap,
        };
      }
      default:
        return (
          fromModel ?? {
            key: def.key,
            heading: def.heading,
            paragraphs: [],
            gap: NO_BASIS_GAP,
          }
        );
    }
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
          : 'The child’s date of birth (for question 2.1).',
    });
  sources.push(...corpus.filter((i) => cited.has(i.id)).map(toSource));

  return {
    sections,
    missingInformation: [
      ...grounded.missingInformation,
      ...SEND35_APPELLANT_CHECKLIST,
    ],
    sources,
    removedUnsupported: removed,
    alerts,
    send35Timing: timing,
  };
}

/**
 * The time limit for a SEND35 draft, worked out on `today` from the dates it
 * holds — so it is right on the day the draft is read or approved, not the day
 * it was written. If a caseworker has changed or removed a date's paragraph,
 * the limit is not guessed from the old date: they are told to work it out.
 */
export function reviewSend35Timing(
  timing: Send35Timing,
  sections: readonly DraftSection[],
  today: string,
  holidays: Holidays = snapshotHolidays(),
): { alerts: string[]; note: string } {
  const paragraphs = new Map(
    sections.flatMap((s) => s.paragraphs).map((p) => [p.id, p]),
  );
  const state = (d: Send35Date | null) => {
    if (!d) return 'absent' as const;
    const p = paragraphs.get(d.paragraphId);
    if (!p) return 'removed' as const;
    return p.edited ? ('changed' as const) : ('kept' as const);
  };
  const decision = state(timing.decisionLetter);
  const certificate = state(timing.mediationCertificate);
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
      `On the dates found in the file, the time limit for this appeal was ${when}, which has passed. Question 13.3 must explain why the appeal is late; a tribunal judge decides whether to accept it.`,
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
 * A SEND35 draft as it should be shown on `today`: the current time-limit
 * warnings added to its alerts, and the time-limit note to Section 13.
 */
export function withSend35Timing<
  T extends { sections: DraftSection[]; alerts: string[] },
>(draft: T, timing: Send35Timing | undefined, today: string): T {
  if (!timing) return draft;
  const review = reviewSend35Timing(timing, draft.sections, today);
  return {
    ...draft,
    alerts: [...draft.alerts, ...review.alerts],
    sections: draft.sections.map((s) =>
      s.key === 'timing'
        ? { ...s, gap: [review.note, s.gap].filter(Boolean).join(' ') }
        : s,
    ),
  };
}
