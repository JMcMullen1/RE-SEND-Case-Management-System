/**
 * config.ts — every controlled vocabulary and business rule.
 *
 * Nothing else in the codebase may redeclare these lists. Each vocabulary is
 * exported as a readonly tuple (`*_VALUES`), a union type, and a Zod enum
 * (`*Schema`) so the same list validates at runtime and constrains at compile
 * time.
 *
 * NOTE: the staff list is NOT here. Staff come from the users table so that
 * joiners and leavers are an admin action, not a deploy. Any control that lists
 * staff builds itself from active users.
 */

import { z } from 'zod';

/** Build a vocabulary: the raw values plus a matching Zod enum. */
function vocab<const T extends readonly [string, ...string[]]>(values: T) {
  return { values, schema: z.enum(values) } as const;
}

// --- Case status ------------------------------------------------------------
export const STATUS_VALUES = [
  'Active',
  'Enquiry',
  'Allocation',
  'Payment/Billing',
  'Dormant',
  'Closed',
] as const;
export type Status = (typeof STATUS_VALUES)[number];
export const StatusSchema = z.enum(STATUS_VALUES);

// --- Teams ------------------------------------------------------------------
export const TEAM_VALUES = ['TSA', 'ISA'] as const;
export type Team = (typeof TEAM_VALUES)[number];
export const TeamSchema = z.enum(TEAM_VALUES);

// --- Owner queues -----------------------------------------------------------
export const OWNER_QUEUE_VALUES = ['Enquiries', 'TSA Team'] as const;
export type OwnerQueue = (typeof OWNER_QUEUE_VALUES)[number];
export const OwnerQueueSchema = z.enum(OWNER_QUEUE_VALUES);

// --- Query types ------------------------------------------------------------
export const QUERY_TYPE_VALUES = [
  'New Application',
  'Draft Review',
  'Review Draft Plan',
  'Annual Review',
  'DLA',
  'PIP',
  'Appeal - Assess',
  'Appeal - Issue',
  'Appeal - Section',
  'General Query',
  'Other',
] as const;
export type QueryType = (typeof QUERY_TYPE_VALUES)[number];
export const QueryTypeSchema = z.enum(QUERY_TYPE_VALUES);

// --- Work types -------------------------------------------------------------
export const WORK_TYPE_VALUES = [
  'Annual Review',
  'Draft Review',
  'Section Appeal',
  'Section B F & I',
  'CAP',
  'DLA',
  'RTA',
  'Personal Budget',
  'Other',
] as const;
export type WorkType = (typeof WORK_TYPE_VALUES)[number];
export const WorkTypeSchema = z.enum(WORK_TYPE_VALUES);

// --- Enquiry methods --------------------------------------------------------
export const ENQUIRY_METHOD_VALUES = [
  'Phone',
  'Email - Enquiries',
  'Email - Admin',
  'Email - Other',
  'Website',
  'Query Form',
  'Facebook',
  'Face to Face',
  'Referral',
  'Other',
] as const;
export type EnquiryMethod = (typeof ENQUIRY_METHOD_VALUES)[number];
export const EnquiryMethodSchema = z.enum(ENQUIRY_METHOD_VALUES);

// --- Payment codes ----------------------------------------------------------
export const PAYMENT_CODE_VALUES = [
  'PM',
  'POC',
  'CP1',
  'CP2',
  'CP3',
  'CP4',
  'PP',
  'REF',
  'NA',
] as const;
export type PaymentCode = (typeof PAYMENT_CODE_VALUES)[number];
export const PaymentCodeSchema = z.enum(PAYMENT_CODE_VALUES);

// --- Discount codes ---------------------------------------------------------
export const DISCOUNT_CODE_VALUES = [
  'AE20',
  'AEPB',
  'AENP',
  'BF25',
  'SIB10',
  'RTA25',
  'PL22',
  'PLF23',
  'PLJ23',
] as const;
export type DiscountCode = (typeof DISCOUNT_CODE_VALUES)[number];
export const DiscountCodeSchema = z.enum(DISCOUNT_CODE_VALUES);

// --- School years -----------------------------------------------------------
export const SCHOOL_YEAR_VALUES = [
  'Nursery/Pre-school',
  'Reception',
  'Yr1',
  'Yr2',
  'Yr3',
  'Yr4',
  'Yr5',
  'Yr6',
  'Yr7',
  'Yr8',
  'Yr9',
  'Yr10',
  'Yr11',
  'Yr12',
  'Yr13',
  'Yr14',
  'Post19',
] as const;
export type SchoolYear = (typeof SCHOOL_YEAR_VALUES)[number];
export const SchoolYearSchema = z.enum(SCHOOL_YEAR_VALUES);

// --- Key date types ---------------------------------------------------------
export const KEY_DATE_TYPE_VALUES = [
  'hearing',
  'evidence_deadline',
  'annual_review',
  'working_document',
  'mediation',
  'consultation',
  'other',
] as const;
export type KeyDateType = (typeof KEY_DATE_TYPE_VALUES)[number];
export const KeyDateTypeSchema = z.enum(KEY_DATE_TYPE_VALUES);

/** Human label for each key-date type, shared by every control that lists them. */
export const KEY_DATE_TYPE_LABELS: Record<KeyDateType, string> = {
  hearing: 'Hearing',
  evidence_deadline: 'Evidence deadline',
  annual_review: 'Annual review',
  working_document: 'Working document',
  mediation: 'Mediation',
  consultation: 'Consultation',
  other: 'Other',
};

/**
 * The colour each key-date type is shown in on the calendar, as a CSS `var()`
 * reference to the custom property emitted by branding.ts. The colour values
 * themselves live only in branding.ts; this map is the single place that binds
 * a type to its colour.
 */
export const KEY_DATE_TYPE_COLOR_VAR: Record<KeyDateType, string> = {
  hearing: 'var(--kd-hearing)',
  evidence_deadline: 'var(--kd-evidence-deadline)',
  annual_review: 'var(--kd-annual-review)',
  working_document: 'var(--kd-working-document)',
  mediation: 'var(--kd-mediation)',
  consultation: 'var(--kd-consultation)',
  other: 'var(--kd-other)',
};

// --- Directions categories --------------------------------------------------
/**
 * The timetable items a SEND First-tier Tribunal directions order sets. These
 * are the categories the directions reader classifies each dated obligation
 * into, and the options offered in the review drop-down — the order's own
 * language, not the generic key-date types. `Other` is the catch-all for a
 * dated obligation that is none of the standard six, so nothing is dropped or
 * mislabelled.
 */
export const DIRECTIONS_CATEGORY_VALUES = [
  'LA response to the Appeal',
  'Final Evidence Deadline',
  'Case Review Form',
  'Final Tribunal Bundle',
  'Case Management Review',
  'Final Hearing',
  'Other',
] as const;
export type DirectionsCategory = (typeof DIRECTIONS_CATEGORY_VALUES)[number];
export const DirectionsCategorySchema = z.enum(DIRECTIONS_CATEGORY_VALUES);

/**
 * Each directions category shown on the calendar in the colour of a key-date
 * type. The category is the label staff see; this only decides its colour, so a
 * directions date sits alongside manually-added key dates coherently.
 */
export const DIRECTIONS_CATEGORY_KEY_DATE_TYPE: Record<
  DirectionsCategory,
  KeyDateType
> = {
  'LA response to the Appeal': 'evidence_deadline',
  'Final Evidence Deadline': 'evidence_deadline',
  'Case Review Form': 'working_document',
  'Final Tribunal Bundle': 'working_document',
  'Case Management Review': 'hearing',
  'Final Hearing': 'hearing',
  Other: 'other',
};

// --- Document folders -------------------------------------------------------
/**
 * Common starting folders that documents are filed under. NOT a fixed set:
 * staff can file into a custom folder, and any folder already in use on a case
 * is offered alongside these. A document's folder is a free-text label — the
 * `DocumentCategory` name is retained internally (and as the DB column) for
 * continuity, but the interface presents these as folders.
 */
export const DEFAULT_DOCUMENT_FOLDERS = [
  'EHCP Draft',
  'EHCP Amended',
  'EHCP Final',
  'Evidence',
  'Expert Report',
  'Correspondence',
  'Tribunal Order',
  'Working Document',
  'School Report',
  'Medical Report',
  'Financial',
  'Other',
] as const;
/** A document's folder: a free-text label (a default or a custom one). */
export const DocumentCategorySchema = z.string().trim().min(1).max(60);
export type DocumentCategory = string;

// --- Corpus item types ------------------------------------------------------
// The kinds of thing the case corpus assembles for AI features. `case_record`,
// `document`, `note` and `email` carry text today; `time_entry` is registered
// so adding it later is additive, never a rewrite.
export const CORPUS_ITEM_TYPE_VALUES = [
  'case_record',
  'document',
  'note',
  'email',
  'time_entry',
] as const;
export type CorpusItemType = (typeof CORPUS_ITEM_TYPE_VALUES)[number];
export const CorpusItemTypeSchema = z.enum(CORPUS_ITEM_TYPE_VALUES);

/** Corpus item types that produce text today. The rest are registered-empty. */
export const CORPUS_ACTIVE_ITEM_TYPES = [
  'case_record',
  'document',
  'note',
  'email',
] as const satisfies readonly CorpusItemType[];

// --- AI job outcomes --------------------------------------------------------
// The result recorded for every AI job run in the cost-accounting table.
// `success` produced validated output; `refusal` was declined by the model's
// safety classifiers; `error` failed (transport or invalid output) after
// retries; `disabled` means the job was switched off and never called.
export const AI_JOB_OUTCOME_VALUES = [
  'success',
  'refusal',
  'error',
  'disabled',
] as const;
export type AiJobOutcome = (typeof AI_JOB_OUTCOME_VALUES)[number];
export const AiJobOutcomeSchema = z.enum(AI_JOB_OUTCOME_VALUES);

// --- Smart fill (JotForm intake) --------------------------------------------
/** Confidence at or below this flags a smart-filled field for a closer look. */
export const INTAKE_LOW_CONFIDENCE = 0.6;
/** The AI job name for the intake extraction, shared by accounting and flags. */
export const EXTRACT_INTAKE_JOB = 'extract_intake';
/** Enquiry method used when a smart-filled submission arrived as an email. */
export const INTAKE_EMAIL_METHOD = 'Email - Enquiries' as const;

// --- Directions-order ingestion ---------------------------------------------
/** The AI job name for directions extraction, shared by accounting and flags. */
export const EXTRACT_DIRECTIONS_JOB = 'extract_directions';
/** Confidence at or below this flags an extracted direction for a closer look. */
export const DIRECTIONS_LOW_CONFIDENCE = 0.6;

// --- Consultation states ----------------------------------------------------
export const CONSULTATION_STATE_VALUES = [
  'not_required',
  'referred',
  'booked',
  'held',
] as const;
export type ConsultationState = (typeof CONSULTATION_STATE_VALUES)[number];
export const ConsultationStateSchema = z.enum(CONSULTATION_STATE_VALUES);

// --- User roles -------------------------------------------------------------
export const USER_ROLE_VALUES = [
  'admin',
  'caseworker',
  'finance',
  'read_only',
] as const;
export type UserRole = (typeof USER_ROLE_VALUES)[number];
export const UserRoleSchema = z.enum(USER_ROLE_VALUES);
/** What each role can do, as the staff admin screen explains it. */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  caseworker: 'Caseworker',
  finance: 'Finance',
  read_only: 'Read only',
};
export const USER_ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin:
    'Everything a caseworker can do, plus staff, rates, archiving schools, deleting cases and the data export.',
  caseworker:
    'Works cases: notes, billable time, documents, emails, schools and drafting.',
  finance: 'Reads cases and writes case notes; does not record billable time.',
  read_only: 'Can look at cases but not change the schools directory or draft.',
};

/**
 * Statuses of a case that is finished with. A leaver's cases in any other
 * status are "open" and offered for handover when they leave.
 */
export const CLOSED_CASE_STATUSES = ['Closed'] as const;
/** Roles a case can be handed to (they work cases). */
export const CASE_OWNER_ROLES = ['admin', 'caseworker'] as const;

// --- Key date sources -------------------------------------------------------
/** Where a key date came from: hand-entered, parsed from a directions order,
 * or captured from a Jotform submission. */
export const KEY_DATE_SOURCE_VALUES = [
  'manual',
  'directions_order',
  'jotform',
] as const;
export type KeyDateSource = (typeof KEY_DATE_SOURCE_VALUES)[number];
export const KeyDateSourceSchema = z.enum(KEY_DATE_SOURCE_VALUES);

// --- Email direction --------------------------------------------------------
export const EMAIL_DIRECTION_VALUES = ['inbound', 'outbound'] as const;
export type EmailDirection = (typeof EMAIL_DIRECTION_VALUES)[number];
export const EmailDirectionSchema = z.enum(EMAIL_DIRECTION_VALUES);
/** Label shown for each email direction (as a chip). */
export const EMAIL_DIRECTION_LABELS: Record<EmailDirection, string> = {
  inbound: 'Received',
  outbound: 'Sent',
};

// --- Assisted drafting --------------------------------------------------------
/** The AI job that drafts a position statement from the case file. */
export const DRAFT_POSITION_STATEMENT_JOB = 'draft_position_statement';

/** The AI job that drafts answers to the SEND35 appeal form from the case file. */
export const DRAFT_SEND35_JOB = 'draft_send35_appeal';

/** Kinds of document the drafting tools produce. */
export const DRAFT_KIND_VALUES = [
  'position_statement',
  'send35_appeal',
] as const;
export type DraftKind = (typeof DRAFT_KIND_VALUES)[number];
export const DraftKindSchema = z.enum(DRAFT_KIND_VALUES);
export const DRAFT_KIND_LABELS: Record<DraftKind, string> = {
  position_statement: 'Position statement',
  send35_appeal: 'SEND35 appeal form',
};
/** One line on what each kind is for, shown where a caseworker chooses one. */
export const DRAFT_KIND_DESCRIPTIONS: Record<DraftKind, string> = {
  position_statement:
    "The appellant's statement of their case for the Tribunal, section by section.",
  send35_appeal:
    'Answers to the SEND35 form for appealing a decision about an EHC plan, ready to copy into the online or paper form.',
};
/** The AI job behind each kind (each can be switched off on its own). */
export const DRAFT_KIND_JOBS: Record<DraftKind, string> = {
  position_statement: DRAFT_POSITION_STATEMENT_JOB,
  send35_appeal: DRAFT_SEND35_JOB,
};

/**
 * A draft's life: being written by the model, ready for review, failed, or
 * approved by a caseworker (then locked, and filed as a case document).
 */
export const DRAFT_STATUS_VALUES = [
  'generating',
  'ready',
  'failed',
  'approved',
] as const;
export type DraftStatus = (typeof DRAFT_STATUS_VALUES)[number];
export const DraftStatusSchema = z.enum(DRAFT_STATUS_VALUES);

/** A draft still "generating" after this long is treated as failed. */
export const DRAFT_GENERATION_TIMEOUT_MINUTES = 15;
/** Above this estimated size the case file is too large to draft from in one go. */
export const DRAFT_MAX_CORPUS_TOKENS = 600_000;
/** Roles that may request, edit and approve drafts (casework). */
export const DRAFTING_ROLES = ['admin', 'caseworker'] as const;
/** Folder an approved draft is filed into as a case document. */
export const DRAFT_DOCUMENT_FOLDER = 'Working Document';

/**
 * The sections of an appellant's position statement for the SEND Tribunal, in
 * order, with what each should cover. The model drafts each from the case file
 * and leaves a section empty (saying so) when the file gives it no basis.
 */
export const POSITION_STATEMENT_SECTIONS = [
  {
    key: 'background',
    heading: 'Background',
    guidance:
      'The child, their age and school year, current placement, and the history of the EHC needs assessment and plan that led to the appeal.',
  },
  {
    key: 'needs',
    heading: "The child's special educational needs (Section B)",
    guidance:
      "The child's needs as the evidence describes them, and where the plan's Section B is inaccurate or incomplete.",
  },
  {
    key: 'provision',
    heading: 'Special educational provision (Section F)',
    guidance:
      'The provision the evidence says the child needs, and where Section F fails to specify or quantify it.',
  },
  {
    key: 'placement',
    heading: 'Placement (Section I)',
    guidance:
      'The school or type of school sought, why it is suitable, and the response to the local authority’s position on placement.',
  },
  {
    key: 'issues',
    heading: 'Issues in dispute',
    guidance: 'The points on which the parties disagree, each stated briefly.',
  },
  {
    key: 'outcome',
    heading: 'Outcome sought',
    guidance: 'What the appellant asks the Tribunal to order.',
  },
] as const;
export type PositionStatementSectionKey =
  (typeof POSITION_STATEMENT_SECTIONS)[number]['key'];
export const POSITION_STATEMENT_SECTION_KEYS = POSITION_STATEMENT_SECTIONS.map(
  (s) => s.key,
) as unknown as readonly [
  PositionStatementSectionKey,
  ...PositionStatementSectionKey[],
];

/**
 * The SEND35 form ("Appeal a decision about an EHC plan") as published by the
 * First-tier Tribunal (SEND). When HMCTS issues a new version, update the
 * version and the sections below to match it.
 */
export const SEND35_FORM = {
  version: 'Version 02, 02.2026',
  /** The GOV.UK page for the form (PDF and guidance). */
  guidanceUrl:
    'https://www.gov.uk/government/publications/form-send35-special-educational-needs-and-disability-tribunal-appeal',
  /** The online version of the form. */
  onlineUrl:
    'https://appeal-about-ehc-plan-decision.form.service.justice.gov.uk/',
  tribunalEmail: 'send@justice.gov.uk',
} as const;

/** Time limits for a SEND appeal: whichever of the two ends later applies. */
export const SEND_APPEAL_MONTHS_FROM_DECISION_LETTER = 2;
export const SEND_APPEAL_MONTHS_FROM_MEDIATION_CERTIFICATE = 1;
/** A deadline this close (in calendar days) is flagged on the draft. */
export const SEND_APPEAL_DEADLINE_WARNING_DAYS = 14;
/** Compulsory school age ends with the academic year (to 31 August) in which a child turns this age. */
export const COMPULSORY_SCHOOL_AGE_ENDS_AT = 16;
/** The Tribunal hears appeals for young people under this age. */
export const SEND_TRIBUNAL_AGE_LIMIT = 25;

/**
 * Where a SEND35 answer comes from: "record" sections are filled by the system
 * straight from the case record (names, contact details) so they cannot be
 * misread; "model" sections are drafted from the case file with sources.
 */
export type DraftSectionFill = 'record' | 'model';

/** The SEND35 form's sections, as answered by a draft, in the form's order. */
export const SEND35_SECTIONS = [
  {
    key: 'child',
    heading: 'Section 1 – Child or young person’s information',
    guidance: 'Name, gender and date of birth, from the case record.',
    fill: 'record',
  },
  {
    key: 'appellant',
    heading: 'Section 2 – Details of the person appealing',
    guidance:
      'Who is appealing and their contact details, from the case record.',
    fill: 'record',
  },
  {
    key: 'people',
    heading:
      'Sections 3 to 7 – Other parent or carer, representative, advocate, communication and parental responsibility',
    guidance:
      'Only what the file shows: another parent or carer (3); whether anyone, including RE-SEND, acts as representative (4) or advocate (5); who should receive information about the appeal (6); and anyone else with parental responsibility, such as a social worker or foster carer, and whether they have been told of the appeal (7).',
    fill: 'model',
  },
  {
    key: 'appeal_type',
    heading: 'Section 8 – Type of appeal',
    guidance:
      'What is being appealed (8.1: refusal to make a plan; refusal to secure a reassessment; disagreement with Section B, F or I; or a decision that a plan is no longer necessary), whether it follows an annual review (8.2), and which of Sections B, F and I are disputed (8.3), as the decision letter and file show.',
    fill: 'model',
  },
  {
    key: 'placement',
    heading: 'Section 9 – School, college or education provider',
    guidance:
      'Only if Section I is disputed: whether the plan names the wrong provider or none (9.1); the provider or type of provider asked for, with its address (9.2 to 9.4); when the provider was contacted and how it responded (9.5, 9.6). The response is reported, not argued.',
    fill: 'model',
  },
  {
    key: 'reasons',
    heading: 'Section 10 – Reasons for the appeal',
    guidance:
      'For each issue in dispute, in turn: what the issue is, why the appellant disagrees, what evidence supports them, and what they want the Tribunal to do. One paragraph per issue where possible.',
    fill: 'model',
  },
  {
    key: 'health_care',
    heading: 'Section 11 – Health and social care (optional)',
    guidance:
      'Only if the file supports asking for recommendations about health (Sections C and G) or social care (Sections D and H): the issues for the Tribunal to consider and the recommendations sought (11.3 to 11.6).',
    fill: 'model',
  },
  {
    key: 'mediation',
    heading: 'Section 12 – Mediation certificate',
    guidance:
      'Whether there is a mediation certificate (12.1). If not, why not (12.2) — for example that the appeal is only about Section I.',
    fill: 'model',
  },
  {
    key: 'timing',
    heading: 'Section 13 – Appealing on time',
    guidance:
      'Only if the appeal is or may be late: the reasons for the delay, why the appeal should go ahead anyway, and why the appellant should not have to wait for an annual review (13.3). The dates on the decision letter and mediation certificate are reported separately.',
    fill: 'model',
  },
  {
    key: 'other_cases',
    heading: 'Sections 14 and 15 – Other SEND appeals and other court cases',
    guidance:
      'Other SEND appeals involving the child, young person or their siblings, with reference numbers (14.1), and any other court or tribunal cases, including the family court, with any orders (15.1) — only as the file shows.',
    fill: 'model',
  },
  {
    key: 'support',
    heading: 'Section 17 – Support during your case',
    guidance:
      'Any spoken language interpreter needed, with languages and dialects (17.1), and reasonable adjustments or support for the appellant or anyone supporting them (17.2), as the file shows.',
    fill: 'model',
  },
  {
    key: 'evidence',
    heading: 'Supporting evidence',
    guidance:
      'One paragraph per document to send with the appeal, as a row of the form’s evidence table: what it is; who signed or wrote it; its date; and its number of pages if the file shows it. Cite the document itself.',
    fill: 'model',
  },
] as const satisfies readonly {
  key: string;
  heading: string;
  guidance: string;
  fill: DraftSectionFill;
}[];
export type Send35SectionKey = (typeof SEND35_SECTIONS)[number]['key'];
/** The sections the model drafts (the rest are filled from the case record). */
export const SEND35_MODEL_SECTION_KEYS = SEND35_SECTIONS.filter(
  (s) => s.fill === 'model',
).map((s) => s.key) as unknown as readonly [
  Send35SectionKey,
  ...Send35SectionKey[],
];

/** What the appellant must do themselves, listed on every SEND35 draft. */
export const SEND35_APPELLANT_CHECKLIST = [
  'Section 16 (hearing preferences) and the declaration are for the appellant to choose and sign.',
  'Send with the form: the local authority’s decision letter, the final EHC plan (if there is one) with the documents listed in its Section K, and the mediation certificate if the appeal needs one.',
  'If the decision was a refusal to carry out an EHC needs assessment, the SEND35A form is used instead.',
] as const;

/** The sections of each kind of draft, in order. */
export const DRAFT_KIND_SECTIONS: Record<
  DraftKind,
  readonly { key: string; heading: string; guidance: string }[]
> = {
  position_statement: POSITION_STATEMENT_SECTIONS,
  send35_appeal: SEND35_SECTIONS,
};
/** Longest section key any kind uses (for request validation). */
export const DRAFT_SECTION_KEY_MAX = 40;

// --- Schools directory --------------------------------------------------------
/**
 * How a school is run and funded (England). "Maintained" schools are run by the
 * local authority; academies and free schools are state-funded but independent
 * of it; independent schools are fee-paying; non-maintained special schools are
 * charitable special schools approved by the DfE.
 */
export const SCHOOL_FUNDING_VALUES = [
  'maintained',
  'academy',
  'free_school',
  'independent',
  'non_maintained_special',
] as const;
export type SchoolFunding = (typeof SCHOOL_FUNDING_VALUES)[number];
export const SchoolFundingSchema = z.enum(SCHOOL_FUNDING_VALUES);
export const SCHOOL_FUNDING_LABELS: Record<SchoolFunding, string> = {
  maintained: 'Maintained (LA)',
  academy: 'Academy',
  free_school: 'Free school',
  independent: 'Independent',
  non_maintained_special: 'Non-maintained special',
};

/** The kind of provision a school offers. */
export const SCHOOL_PROVISION_VALUES = [
  'mainstream',
  'mainstream_resource_base',
  'specialist',
  'alternative_provision',
] as const;
export type SchoolProvision = (typeof SCHOOL_PROVISION_VALUES)[number];
export const SchoolProvisionSchema = z.enum(SCHOOL_PROVISION_VALUES);
export const SCHOOL_PROVISION_LABELS: Record<SchoolProvision, string> = {
  mainstream: 'Mainstream',
  mainstream_resource_base: 'Mainstream with resource base',
  specialist: 'Specialist',
  alternative_provision: 'Alternative provision',
};

/** How a school relates to a case. */
export const CASE_SCHOOL_ROLE_VALUES = [
  'current',
  'proposed',
  'named_in_plan',
  'previous',
] as const;
export type CaseSchoolRole = (typeof CASE_SCHOOL_ROLE_VALUES)[number];
export const CaseSchoolRoleSchema = z.enum(CASE_SCHOOL_ROLE_VALUES);
export const CASE_SCHOOL_ROLE_LABELS: Record<CaseSchoolRole, string> = {
  current: 'Current school',
  proposed: 'Proposed school',
  named_in_plan: 'Named in the plan',
  previous: 'Previous school',
};

/** Common job titles offered for a school contact (free text is allowed). */
export const SCHOOL_CONTACT_ROLE_SUGGESTIONS = [
  'SENCo',
  'Headteacher',
  'Deputy headteacher',
  'Class teacher',
  'Head of year',
  'Admissions',
  'School office',
  'Designated safeguarding lead',
] as const;

/** Roles that may add and edit schools and their contacts. Read-only may not. */
export const SCHOOL_DIRECTORY_EDIT_ROLES = [
  'admin',
  'caseworker',
  'finance',
] as const;

// --- Time recording ---------------------------------------------------------
/** Time is recorded in units of this many minutes; entries round UP to a unit. */
export const TIME_UNIT_MINUTES = 15;
/** Roles that record their own time (billables). Finance and read-only do not. */
export const TIME_RECORDING_ROLES = ['admin', 'caseworker'] as const;
/** The furthest back a billable may be dated, in days, to catch typos. */
export const TIME_ENTRY_MAX_BACKDATE_DAYS = 31;
/** The most time one entry may carry (a sanity bound against typos). */
export const TIME_ENTRY_MAX_MINUTES = 12 * 60;
/**
 * The two hourly rates an admin sets per member of staff. `pay` is what the
 * person earns for their recorded time; `work` is what the work is charged at,
 * for QuickBooks later. Each is dated, so a change never rewrites the past.
 */
export const RATE_KIND_VALUES = ['pay', 'work'] as const;
export type RateKind = (typeof RATE_KIND_VALUES)[number];
export const RateKindSchema = z.enum(RATE_KIND_VALUES);
export const RATE_KIND_LABELS: Record<RateKind, string> = {
  pay: 'Pay rate',
  work: 'Work rate (QuickBooks)',
};
/** Periods the "My time" page totals by. */
export const TIME_PERIOD_VALUES = ['day', 'week', 'month'] as const;
export type TimePeriod = (typeof TIME_PERIOD_VALUES)[number];
export const TimePeriodSchema = z.enum(TIME_PERIOD_VALUES);

// --- Email filing -----------------------------------------------------------
/** File extensions accepted as a filed email: RFC 822 (.eml) and Outlook (.msg). */
export const EMAIL_FILE_EXTENSIONS = ['.eml', '.msg'] as const;
/** Folder an email's attachments are filed into as case documents. */
export const EMAIL_ATTACHMENT_FOLDER = 'Correspondence' as const;
/**
 * Inline images smaller than this (bytes) are treated as signature logos and
 * not filed as documents. Larger inline images (e.g. a photographed letter
 * pasted into the body) are kept.
 */
export const EMAIL_INLINE_IMAGE_MIN_BYTES = 20 * 1024;
/**
 * Public mail providers. A sender on one of these domains is never treated as
 * staff just because a staff account shares the domain — only an exact address
 * match counts. A sender on any other domain a staff account uses (the
 * charity's own) is treated as outbound correspondence.
 */
export const EMAIL_PUBLIC_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'live.co.uk',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'icloud.com',
  'me.com',
  'aol.com',
  'btinternet.com',
  'sky.com',
  'virginmedia.com',
  'protonmail.com',
  'proton.me',
] as const;

// --- Note kind --------------------------------------------------------------
// A note is either a normal case note or a billable. A billable is just a
// labelled note (same shape); this is NOT time tracking.
export const NOTE_KIND_VALUES = ['note', 'billable'] as const;
export type NoteKind = (typeof NOTE_KIND_VALUES)[number];
export const NoteKindSchema = z.enum(NOTE_KIND_VALUES);
/** Label shown for each note kind (as a chip). */
export const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  note: 'Case notes',
  billable: 'Billables',
};

// --- External sync status ---------------------------------------------------
/** Sync state of a time entry against the external accounting system. */
export const EXTERNAL_SYNC_STATUS_VALUES = [
  'not_synced',
  'pending',
  'synced',
  'failed',
] as const;
export type ExternalSyncStatus = (typeof EXTERNAL_SYNC_STATUS_VALUES)[number];
export const ExternalSyncStatusSchema = z.enum(EXTERNAL_SYNC_STATUS_VALUES);

// --- Thresholds -------------------------------------------------------------
/** Tunable day-count thresholds that drive row status rules. */
export const THRESHOLDS = {
  /** A note older than this many days is considered stale. */
  staleNoteDays: 30,
  /** A case whose review falls within this many days is considered due. */
  reviewDueDays: 30,
} as const;

// --- Row status rules -------------------------------------------------------
/**
 * Rules that flag a case row for attention. Every flag renders in the single
 * status colour (`--status-amber`); no other status colour exists in the
 * interface.
 */
export const ROW_STATUS_RULES = {
  staleNote: {
    description: 'Most recent note is older than the stale-note threshold.',
    thresholdDays: THRESHOLDS.staleNoteDays,
    tone: 'status-amber',
  },
  reviewDue: {
    description: 'Annual review falls due within the review-due threshold.',
    thresholdDays: THRESHOLDS.reviewDueDays,
    tone: 'status-amber',
  },
} as const;
export type RowStatusFlag = keyof typeof ROW_STATUS_RULES;

/**
 * Suggest a National Curriculum school year from a date of birth, using the
 * child's age on 31 August of the current academic year. Overridable.
 */
export function suggestSchoolYear(
  dobISO: string | null | undefined,
  today: string,
): SchoolYear | null {
  if (!dobISO) return null;
  const [by, bm] = dobISO.split('-').map(Number);
  const [ty, tm] = today.split('-').map(Number);
  if (!by || !bm || !ty || !tm) return null;
  const referenceYear = tm >= 9 ? ty : ty - 1;
  const ageAt31Aug = referenceYear - by - (bm >= 9 ? 1 : 0);
  if (ageAt31Aug < 4) return 'Nursery/Pre-school';
  if (ageAt31Aug === 4) return 'Reception';
  if (ageAt31Aug >= 5 && ageAt31Aug <= 18)
    return `Yr${ageAt31Aug - 4}` as SchoolYear;
  return 'Post19';
}

// --- Case list: key date type priority --------------------------------------
/**
 * When a case has several key dates on the same day, the most consequential is
 * shown. Lower rank = more consequential: hearing, then deadline, then meeting,
 * then everything else.
 */
export const KEY_DATE_TYPE_PRIORITY: Record<KeyDateType, number> = {
  hearing: 0,
  evidence_deadline: 1,
  working_document: 2,
  annual_review: 3,
  mediation: 4,
  consultation: 5,
  other: 6,
};

// --- Case list: quick-filter pills ------------------------------------------
export const QUICK_FILTER_VALUES = [
  'all',
  'mine',
  'toBeAssigned',
  'active',
  'tsa',
  'isa',
  'paymentsBilling',
] as const;
export type QuickFilterId = (typeof QUICK_FILTER_VALUES)[number];
export const QUICK_FILTERS: { id: QuickFilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
  { id: 'toBeAssigned', label: 'To be assigned' },
  { id: 'active', label: 'Active' },
  { id: 'tsa', label: 'TSA' },
  { id: 'isa', label: 'ISA' },
  { id: 'paymentsBilling', label: 'Payments & Billing' },
];

// --- Case list: sorts -------------------------------------------------------
export const SORT_VALUES = [
  'keyDateSoonest',
  'clientName',
  'childName',
  'dateAddedNewest',
  'dateAddedOldest',
  'lastUpdatedNewest',
  'lastUpdatedOldest',
  'lastReviewedOldest',
  'staffThenKeyDate',
] as const;
export type SortId = (typeof SORT_VALUES)[number];
export const SortSchema = z.enum(SORT_VALUES);
export const DEFAULT_SORT: SortId = 'keyDateSoonest';
export const SORTS: { id: SortId; label: string }[] = [
  { id: 'keyDateSoonest', label: 'Key date (soonest first)' },
  { id: 'clientName', label: 'Client name (A–Z)' },
  { id: 'childName', label: 'Child name (A–Z)' },
  { id: 'dateAddedNewest', label: 'Date added (newest)' },
  { id: 'dateAddedOldest', label: 'Date added (oldest)' },
  { id: 'lastUpdatedNewest', label: 'Last updated (newest)' },
  {
    id: 'lastUpdatedOldest',
    label: 'Last updated (oldest first — surfaces neglect)',
  },
  { id: 'lastReviewedOldest', label: 'Last reviewed (oldest)' },
  { id: 'staffThenKeyDate', label: 'Staff, then key date' },
];

// --- Case list: optional advanced columns -----------------------------------
// Status and Updated are shown by default in advanced view and are not
// toggleable. These are the columns a user can switch on and persist.
export const OPTIONAL_COLUMN_VALUES = [
  'team',
  'dateOfEnquiry',
  'methodOfEnquiry',
  'dealingShadow',
  'schoolYear',
  'paymentCode',
  'discountCode',
  'invoiceStatus',
  'consultationState',
  'lastReviewed',
] as const;
export type OptionalColumnId = (typeof OPTIONAL_COLUMN_VALUES)[number];
export const OptionalColumnSchema = z.enum(OPTIONAL_COLUMN_VALUES);
export const OPTIONAL_COLUMNS: { id: OptionalColumnId; label: string }[] = [
  { id: 'team', label: 'Team' },
  { id: 'dateOfEnquiry', label: 'Date of enquiry' },
  { id: 'methodOfEnquiry', label: 'Method of enquiry' },
  { id: 'dealingShadow', label: 'Dealing/Shadow' },
  { id: 'schoolYear', label: 'School year' },
  { id: 'paymentCode', label: 'Payment code' },
  { id: 'discountCode', label: 'Discount code' },
  { id: 'invoiceStatus', label: 'Invoice status' },
  { id: 'consultationState', label: 'Consultation state' },
  { id: 'lastReviewed', label: 'Last reviewed' },
];

// --- Case list: filter facets -----------------------------------------------
/**
 * Every facet in the "More filters" popover. Each facet is multi-select and,
 * in the UI, shows a live option count. AND across facets, OR within a facet.
 *
 * `source` tells the UI where a facet's options come from: a static vocabulary,
 * the active users list, values discovered from the data (e.g. enquiry years),
 * a numeric day threshold, or a plain boolean. `unspecified` marks the three
 * facets that are wanted but not yet defined — the extension point below.
 */
export type FacetSource =
  | { kind: 'vocab'; values: readonly string[] }
  | { kind: 'users' }
  | { kind: 'dynamic' }
  | { kind: 'days' }
  | { kind: 'boolean' }
  | { kind: 'unspecified' };

export interface FacetDef {
  id: string;
  label: string;
  source: FacetSource;
  /** Disabled facets are wired but hidden until switched on. */
  enabled: boolean;
}

export const FACETS: FacetDef[] = [
  { id: 'staff', label: 'Staff', source: { kind: 'users' }, enabled: true },
  {
    id: 'dealingShadow',
    label: 'Dealing/Shadow',
    source: { kind: 'users' },
    enabled: true,
  },
  {
    id: 'status',
    label: 'Status',
    source: { kind: 'vocab', values: STATUS_VALUES },
    enabled: true,
  },
  {
    id: 'team',
    label: 'Team',
    source: { kind: 'vocab', values: TEAM_VALUES },
    enabled: true,
  },
  {
    id: 'workType',
    label: 'Type of case',
    source: { kind: 'vocab', values: WORK_TYPE_VALUES },
    enabled: true,
  },
  {
    id: 'queryType',
    label: 'Query type',
    source: { kind: 'vocab', values: QUERY_TYPE_VALUES },
    enabled: true,
  },
  {
    id: 'enquiryMethod',
    label: 'Enquiry method',
    source: { kind: 'vocab', values: ENQUIRY_METHOD_VALUES },
    enabled: true,
  },
  {
    id: 'enquiryYear',
    label: 'Enquiry year',
    source: { kind: 'dynamic' },
    enabled: true,
  },
  {
    id: 'paymentCode',
    label: 'Payment code',
    source: { kind: 'vocab', values: PAYMENT_CODE_VALUES },
    enabled: true,
  },
  {
    id: 'discountCode',
    label: 'Discount code',
    source: { kind: 'vocab', values: DISCOUNT_CODE_VALUES },
    enabled: true,
  },
  {
    id: 'schoolYear',
    label: 'School year',
    source: { kind: 'vocab', values: SCHOOL_YEAR_VALUES },
    enabled: true,
  },
  {
    id: 'consultationState',
    label: 'Consultation state',
    source: { kind: 'vocab', values: CONSULTATION_STATE_VALUES },
    enabled: true,
  },
  {
    id: 'noNoteInDays',
    label: 'No note in N days',
    source: { kind: 'days' },
    enabled: true,
  },
  {
    id: 'notReviewedInDays',
    label: 'Not reviewed in N days',
    source: { kind: 'days' },
    enabled: true,
  },
  {
    id: 'keyDatePassed',
    label: 'Key date passed',
    source: { kind: 'boolean' },
    enabled: true,
  },
  {
    id: 'keyDateWithinDays',
    label: 'Key date within N days',
    source: { kind: 'days' },
    enabled: true,
  },
  {
    id: 'noKeyDate',
    label: 'No key date set',
    source: { kind: 'boolean' },
    enabled: true,
  },
  {
    id: 'missingConsent',
    label: 'Missing consent',
    source: { kind: 'boolean' },
    enabled: true,
  },

  // --- Extension point --------------------------------------------------------
  // These three facets are wanted but not yet defined. Their meaning and values
  // are unknown; do NOT invent them. Set `enabled: true` and give each a proper
  // `source` once the product defines it.
  {
    id: 'support',
    label: 'Support',
    source: { kind: 'unspecified' },
    enabled: false,
  },
  {
    id: 'noConsult',
    label: 'No Consult',
    source: { kind: 'unspecified' },
    enabled: false,
  },
  {
    id: 'inactive',
    label: 'Inactive',
    source: { kind: 'unspecified' },
    enabled: false,
  },
];

// --- Case list: default day thresholds for scalar facets --------------------
export const FILTER_DAY_DEFAULTS = {
  noNoteInDays: 30,
  notReviewedInDays: 7,
  keyDateWithinDays: 14,
} as const;

// --- Case list: seeded saved views ------------------------------------------
/**
 * Shared, read-only starting views. Each remembers whether it opens simple or
 * advanced. `mine` resolves to the current user at query time.
 */
export interface SavedViewSeed {
  id: string;
  name: string;
  mode: 'simple' | 'advanced';
  sort: SortId;
  filters: Record<string, unknown>;
}
export const SAVED_VIEW_SEEDS: SavedViewSeed[] = [
  {
    id: 'seed-my-active',
    name: 'My active cases',
    mode: 'simple',
    sort: 'keyDateSoonest',
    filters: { mine: true, status: ['Active'] },
  },
  {
    id: 'seed-to-be-assigned',
    name: 'To be assigned',
    mode: 'simple',
    sort: 'dateAddedNewest',
    filters: { unassigned: true },
  },
  {
    id: 'seed-awaiting-consultation',
    name: 'Awaiting consultation',
    mode: 'advanced',
    sort: 'keyDateSoonest',
    filters: { consultationState: ['referred', 'booked'] },
  },
  {
    id: 'seed-payments-billing',
    name: 'Payments & Billing',
    mode: 'simple',
    sort: 'keyDateSoonest',
    filters: { status: ['Payment/Billing'] },
  },
  {
    id: 'seed-no-note-30',
    name: 'No note in 30 days',
    mode: 'advanced',
    sort: 'lastUpdatedOldest',
    filters: { noNoteInDays: 30 },
  },
  {
    id: 'seed-not-reviewed-week',
    name: 'Not reviewed this week',
    mode: 'advanced',
    sort: 'lastReviewedOldest',
    filters: { notReviewedInDays: 7 },
  },
  {
    id: 'seed-no-key-date',
    name: 'No key date set',
    mode: 'advanced',
    sort: 'dateAddedNewest',
    filters: { noKeyDate: true },
  },
];

// Keep the vocab helper referenced for future single-line vocabularies.
export { vocab };
