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

/** The AI jobs that draft answers to each Tribunal form from the case file. */
export const DRAFT_SEND35_JOB = 'draft_send35_appeal';
export const DRAFT_SEND35A_JOB = 'draft_send35a_appeal';
export const DRAFT_SEND7_JOB = 'draft_send7_request';
export const DRAFT_SEND45_JOB = 'draft_send45_case_review';

/** The Tribunal forms the drafting tools fill in. */
export const TRIBUNAL_FORM_KINDS = [
  'send35_appeal',
  'send35a_appeal',
  'send7_request',
  'send45_case_review',
  'send28_appeal',
  'send28a_appeal',
  'send4a_claim',
  'send4b_claim',
  'send26a_claim',
  'send26b_claim',
  'send8_withdrawal',
  'send11_attendance',
  'send11yp_attendance',
  'send30_witness_summons',
  'send15a_expenses',
  'send15ayp_expenses',
  'send16a_expenses',
  'send17_missing_receipts',
  'send20a_permission',
  'send20b_review',
  'send20c_set_aside',
] as const;
export type TribunalFormKind = (typeof TRIBUNAL_FORM_KINDS)[number];

/** Kinds of document the drafting tools produce. */
export const DRAFT_KIND_VALUES = [
  'position_statement',
  ...TRIBUNAL_FORM_KINDS,
] as const;
export type DraftKind = (typeof DRAFT_KIND_VALUES)[number];
export const DraftKindSchema = z.enum(DRAFT_KIND_VALUES);
export const DRAFT_KIND_LABELS: Record<DraftKind, string> = {
  position_statement: 'Position statement',
  send35_appeal: 'SEND35 appeal form',
  send35a_appeal: 'SEND35A appeal form (refusal to assess)',
  send7_request: 'SEND7 request for change',
  send45_case_review: 'SEND45 case review form',
  send28_appeal: 'SEND28 appeal (child in youth custody)',
  send28a_appeal: 'SEND28A appeal (young person in youth custody)',
  send4a_claim: 'SEND4A discrimination claim (parent)',
  send4b_claim: 'SEND4B discrimination claim (young person)',
  send26a_claim: 'SEND26A exclusion claim (parent)',
  send26b_claim: 'SEND26B exclusion claim (young person)',
  send8_withdrawal: 'SEND8 withdraw an appeal or claim',
  send11_attendance: 'SEND11 attendance form (parents)',
  send11yp_attendance: 'SEND11YP attendance form (young person)',
  send30_witness_summons: 'SEND30 witness summons request',
  send15a_expenses: 'SEND15A expenses claim (parents)',
  send15ayp_expenses: 'SEND15AYP expenses claim (young person)',
  send16a_expenses: 'SEND16A expenses claim (witness)',
  send17_missing_receipts: 'SEND17 missing tickets or receipts',
  send20a_permission: 'SEND20A permission to appeal',
  send20b_review: 'SEND20B review of a decision',
  send20c_set_aside: 'SEND20C set aside a decision',
};
/** One line on what each kind is for, shown where a caseworker chooses one. */
export const DRAFT_KIND_DESCRIPTIONS: Record<DraftKind, string> = {
  position_statement:
    "The appellant's statement of their case for the Tribunal, section by section.",
  send35_appeal:
    'Appeal a decision about an EHC plan: a refusal to issue or reassess, Sections B, F or I, or ceasing the plan.',
  send35a_appeal:
    'Appeal a local authority’s refusal to carry out an EHC needs assessment.',
  send7_request:
    'Once an appeal is registered: ask the Tribunal for a change, such as more time, a new hearing date, an extra witness or an observer.',
  send45_case_review:
    'Once an appeal is registered: tell the Tribunal what is still in dispute and whether the appeal is ready, by the bundle deadline.',
  send28_appeal:
    'Use instead of SEND35 or SEND35A when the parent is appealing an EHC needs assessment or EHC plan decision for a child of or under statutory school age who is detained in youth accommodation.',
  send28a_appeal:
    'Use when a young person over statutory school age and under 18, detained in youth accommodation, is appealing an EHC needs assessment or EHC plan decision in their own name.',
  send4a_claim:
    'A parent’s claim that a school discriminated against their child because of disability, where the parent is not asking for reinstatement after a permanent exclusion.',
  send4b_claim:
    'A young person’s own claim, once over compulsory school age, that a school discriminated against them because of disability, where they are not asking for reinstatement after a permanent exclusion.',
  send26a_claim:
    'A parent’s fast-track claim that their child’s permanent exclusion was disability discrimination, asking the Tribunal to order the school to reinstate the child.',
  send26b_claim:
    'A young person’s own fast-track claim, once over compulsory school age, that their permanent exclusion was disability discrimination, asking for an order that they be reinstated.',
  send8_withdrawal:
    'Use when the parent or young person has decided to withdraw their appeal or disability discrimination claim, for example after the local authority has agreed or an agreement has been reached.',
  send11_attendance:
    'Use to tell the Tribunal who will attend the hearing for the parents: whether the child is coming, any representative, up to three witnesses and any special requirements.',
  send11yp_attendance:
    'Use when the young person is the appellant, to tell the Tribunal who will attend the hearing for them: any representative, up to three witnesses and any special requirements.',
  send30_witness_summons:
    'Use when a witness whose evidence the appeal needs will not come to the final hearing voluntarily, to ask a Tribunal Judge or Registrar to summon them.',
  send15a_expenses:
    'Use after the hearing to claim the parents’ travel expenses for attending it.',
  send15ayp_expenses:
    'Use after the hearing to claim a young person appellant’s travel expenses for attending it.',
  send16a_expenses:
    'Use after the hearing for a witness who gave evidence for the family to claim their travel expenses and any loss of earnings.',
  send17_missing_receipts:
    'Use alongside an expenses claim on SEND15A or SEND16A when the parent or witness cannot provide a travel ticket or receipt.',
  send20a_permission:
    'Use when the parent wants to challenge a Tribunal decision they believe is wrong in law, by asking for permission to appeal it to the Upper Tribunal.',
  send20b_review:
    'Use when circumstances relevant to a special educational needs appeal have changed since the Tribunal decided it, and the parent wants the Tribunal to review and amend its decision.',
  send20c_set_aside:
    'Use when something went wrong with the proceedings — a document was not sent or received in time, the parent or representative was not at the hearing, or another procedural irregularity — and the parent wants the decision set aside.',
};
/** The AI job behind each kind (each can be switched off on its own). */
export const DRAFT_KIND_JOBS: Record<DraftKind, string> = {
  position_statement: DRAFT_POSITION_STATEMENT_JOB,
  send35_appeal: DRAFT_SEND35_JOB,
  send35a_appeal: DRAFT_SEND35A_JOB,
  send7_request: DRAFT_SEND7_JOB,
  send45_case_review: DRAFT_SEND45_JOB,
  send28_appeal: 'draft_send28_appeal',
  send28a_appeal: 'draft_send28a_appeal',
  send4a_claim: 'draft_send4a_claim',
  send4b_claim: 'draft_send4b_claim',
  send26a_claim: 'draft_send26a_claim',
  send26b_claim: 'draft_send26b_claim',
  send8_withdrawal: 'draft_send8_withdrawal',
  send11_attendance: 'draft_send11_attendance',
  send11yp_attendance: 'draft_send11yp_attendance',
  send30_witness_summons: 'draft_send30_witness_summons',
  send15a_expenses: 'draft_send15a_expenses',
  send15ayp_expenses: 'draft_send15ayp_expenses',
  send16a_expenses: 'draft_send16a_expenses',
  send17_missing_receipts: 'draft_send17_missing_receipts',
  send20a_permission: 'draft_send20a_permission',
  send20b_review: 'draft_send20b_review',
  send20c_set_aside: 'draft_send20c_set_aside',
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
    optional: true,
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
    optional: true,
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
] as const satisfies readonly TribunalFormSectionDef[];
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

/** Working days the other party must be given to respond before a SEND7 is sent. */
export const SEND7_NOTICE_WORKING_DAYS = 5;

/** The SEND35A form (appeal a refusal to secure an EHC needs assessment). */
export const SEND35A_SECTIONS = [
  {
    key: 'child',
    heading: 'Section 1 – Who is the appeal about?',
    guidance:
      'Child or young person, name, gender and date of birth, from the case record.',
    fill: 'record',
  },
  {
    key: 'reasons',
    heading: 'Section 2 – Reasons for appeal',
    guidance:
      'The two questions the Tribunal decides under section 36(8) of the Children and Families Act 2014, each answered in turn. Question one: the special educational needs the child or young person has, and any they may have that are not yet fully identified. Question two: why they may require an EHC plan — for example the support already in place and why it has not been enough, their progress, and what the school or professionals say. Cite each report, its author and date.',
    fill: 'model',
  },
  {
    key: 'decision',
    heading: 'Section 3 – Making the appeal',
    guidance:
      'Only if the appeal is late, or there is no mediation certificate: why, and why the appeal should go ahead. The local authority and the decision letter date are reported separately.',
    fill: 'model',
    optional: true,
  },
  {
    key: 'other_cases',
    heading: 'Section 4 – Deciding your appeal: existing appeals and claims',
    guidance:
      'Any other current appeal for this child or young person or a sibling, with its appeal number, and any disability discrimination claim, with its date and number — only as the file shows.',
    fill: 'model',
  },
  {
    key: 'appellant',
    heading: 'Section 5 – Who is making the appeal?',
    guidance:
      'Who is appealing and their contact details, from the case record.',
    fill: 'record',
  },
  {
    key: 'people',
    heading: 'Section 6 – Who else is involved in the appeal?',
    guidance:
      'Only what the file shows: anyone else with parental responsibility or a Court of Protection deputy, and whether they have been told of the appeal; any court or tribunal order about the child or young person, including the family court; the young person’s advocate; any representative, including RE-SEND; and who should receive the papers.',
    fill: 'model',
  },
  {
    key: 'support',
    heading: 'Section 7 – The hearing: your needs and requirements',
    guidance:
      'Any special needs to take into account in arranging the hearing, and any interpreter or signer needed, with the language and dialect — as the file shows.',
    fill: 'model',
  },
  {
    key: 'evidence',
    heading: 'Section 11 – Evidence to be considered in the appeal',
    guidance:
      'One paragraph per document to send, as a row of the form’s table: its date; number of pages if known; who signed or wrote it and what kind of document it is; and, if not obvious, why it is relevant. Cite the document itself.',
    fill: 'model',
  },
] as const satisfies readonly TribunalFormSectionDef[];

/** The SEND7 form (request for change). */
export const SEND7_SECTIONS = [
  {
    key: 'details',
    heading: 'Case details',
    guidance:
      'Child or young person’s name, appeal number, local authority and final hearing date, from the case record.',
    fill: 'record',
  },
  {
    key: 'request',
    heading: 'I wish to apply to the tribunal for',
    guidance:
      'Which of the form’s requests this is, using its wording: an extension of time to comply with a direction; a change to the final hearing date; a witness summons; permission to amend grounds of appeal; strike out the appeal/LA barred; permission to bring an additional witness; an observer to attend the hearing; or other (say what). Also the type of appeal (for example Sections B, F and I) as the file shows.',
    fill: 'model',
  },
  {
    key: 'reasons',
    heading: 'The reasons I am applying are',
    guidance:
      'Why the request is made, from the file. For more time: the direction concerned, its current date, the date by which it can be met, and why. For a new hearing date: why, and three dates agreed with the local authority. For a witness summons: the efforts made to secure attendance and why no other way of giving the evidence will do, with the witness’s name, occupation and address. For an extra witness or an observer: why they are needed.',
    fill: 'model',
  },
  {
    key: 'other_party',
    heading: 'The other party’s response',
    guidance:
      'The local authority’s response to the request, as the file shows it (an email or letter), or that they did not reply. The form is returned unconsidered without it.',
    fill: 'model',
  },
] as const satisfies readonly TribunalFormSectionDef[];

/** The SEND45 form (case review). */
export const SEND45_SECTIONS = [
  {
    key: 'details',
    heading: 'Case details',
    guidance:
      'Child or young person’s name and appeal number, and the bundle deadline, from the case record.',
    fill: 'record',
  },
  {
    key: 'issues',
    heading: 'Progress of the appeal (questions 1 to 3)',
    guidance:
      'Which decisions are still for the Tribunal, leaving out anything agreed, using the form’s list (refusal to assess; refusal to reassess; refusal to issue a plan; Section B; Section F; Section I; Sections C and G (health); Sections D and H (social care); ceasing the plan) (1). Whether there is a working document, and the date of its latest version (2). The headline issues outstanding, one paragraph each, such as the description of speech and language needs or the hours of one-to-one support (3).',
    fill: 'model',
  },
  {
    key: 'placement',
    heading: 'Educational placement (questions 4 to 6)',
    guidance:
      'Only if Section I is in dispute: whether the child or young person is attending school or college, and if not when they last did and what provision they have now (4); the school or college asked for by the parent or young person, with its address (5); the one proposed by the local authority, with its address (6). If an independent school not on the section 41 list is asked for, whether the file shows an offer of a place.',
    fill: 'model',
  },
  {
    key: 'readiness',
    heading: 'Readiness for hearing (questions 7 and 8)',
    guidance:
      'Whether the appeal is ready for a final hearing, and if not why and when it will be (7); if a new timetable is agreed, its dates for final evidence, the updated case review form, the supplementary bundle, the final working document and the hearing (8) — only as the file shows.',
    fill: 'model',
  },
  {
    key: 'people',
    heading: 'Representative, supporter and witnesses (questions 9 to 12)',
    guidance:
      'Any representative at the hearing, with name and status (volunteer representative, paid representative, solicitor, counsel or other) (9); any parental supporter or advocate (10); each witness’s name and occupation (11); whether every witness has given a written statement or report, and if not why (12) — only as the file shows.',
    fill: 'model',
  },
  {
    key: 'support',
    heading: 'Special requirements (question 13)',
    guidance:
      'Any special requirements of the appellant or their witnesses at the hearing, as the file shows.',
    fill: 'model',
  },
] as const satisfies readonly TribunalFormSectionDef[];

/** A section of a Tribunal form, and how it is filled. */
export interface TribunalFormSectionDef {
  key: string;
  heading: string;
  guidance: string;
  fill: DraftSectionFill;
  /** For a record section: which record builder fills it (default: its key). */
  builder?: 'child' | 'appellant' | 'details' | 'names';
  /** Left empty when it does not apply (e.g. reasons for lateness), without a gap. */
  optional?: boolean;
}

// The forms below were mapped question by question from the published PDFs
// (versions as given in each entry); headings follow the forms' own numbering.
export const SEND28_SECTIONS = [
  {
    key: 'child',
    heading: 'Section 1 – Your child’s details',
    guidance:
      'Surname, first name(s) and date of birth, from the case record. Gender (Boy/Girl) and the home address are not on the case record and are left for the caseworker to confirm.',
    fill: 'record',
  },
  {
    key: 'detention',
    heading: 'Section 1 – Youth accommodation and detention details',
    guidance:
      'Name and address (with postcode) of the youth accommodation at which the child is detained; date of the sentence, remand or recall order; length of the sentence or detention order; and anticipated date of release — only as the file shows (for example the YOT, the establishment or court papers). The two dates are reported separately.',
    fill: 'model',
  },
  {
    key: 'appeal_type',
    heading: 'Section 2 – What are you appealing against?',
    guidance:
      'Which of the form’s boxes apply, in its words: I (or the person in charge of the custodial establishment) requested an assessment of my child’s EHC needs but the Local Authority refused to secure an EHC needs assessment; the Local Authority has secured an assessment of my child’s EHC needs but refused to make an EHC plan; or the Local Authority made an EHC plan which will come into effect post detention AND I disagree with what the EHC plan says about my child’s educational needs / about the educational help/provision my child should receive / I disagree with the school named in Part I of the EHC plan / the Local Authority has not named a school in Part I of the EHC plan — as the decision letter and file show.',
    fill: 'model',
  },
  {
    key: 'reasons',
    heading: 'Section 2 – Reasons (the form’s seven boxes)',
    guidance:
      'One answer per box, only those that apply to the decision appealed: I disagree with the Local Authority’s (LA’s) decision because; I disagree with the description of my child’s difficulties because; My child’s difficulties are; I disagree with the LA description of my child’s provision because; The help that my child requires to learn is; I disagree with the LA’s choice of school/institution because; I prefer my choice of school/institution because. For each: the evidence, its author and date, and what is asked for. Cite every report.',
    fill: 'model',
  },
  {
    key: 'decision',
    heading:
      'Section 3 – Your appeal: local authority and existing claims/appeals',
    guidance:
      'Which local authority made the decision appealed, as the decision letter shows (it should match the local authority on the case record); whether there is another current appeal in relation to this child, with its appeal number; and whether there is an existing disability discrimination claim, with its date and claim number — only as the file shows. The decision letter date is reported separately; the consent questions are for the parent.',
    fill: 'model',
  },
  {
    key: 'appellant',
    heading: 'Section 4 – Your contact details: Parent One',
    guidance:
      'Parent One’s title, surname, first name(s), relationship to the child (e.g. parent, guardian, foster parent or person who has care of the child), home address and postcode, daytime and mobile phone numbers and email address, from the case record.',
    fill: 'record',
  },
  {
    key: 'people',
    heading:
      'Section 4 – Parental responsibility, Parent Two, representative and who receives information',
    guidance:
      'Only what the file shows: any other person or organisation sharing parental responsibility (for example a local authority under a care order), with name and address, and confirmation they have been notified of the appeal — or why they should not receive details of it; Parent Two’s details; any representative, including RE-SEND, and whether they are legally qualified (Yes/No); and who should receive information about the appeal (Parent One, Parent Two or Representative — the representative if none is chosen, otherwise the first named parent).',
    fill: 'model',
  },
  {
    key: 'witnesses',
    heading: 'Section 5 – Witnesses',
    guidance:
      'Up to three witnesses, each with name and profession, as the file shows (for example a teacher, educational psychologist, speech and language therapist or YOT worker).',
    fill: 'model',
  },
  {
    key: 'support',
    heading: 'Section 6 – The hearing: your needs and requirements',
    guidance:
      'Question 1: any special needs to take into account when arranging the hearing, such as hearing loops or disability access. Question 2: whether an interpreter or signer is needed, with the language or type of sign language and the dialect — as the file shows.',
    fill: 'model',
  },
  {
    key: 'timing',
    heading: 'Section 9 – Late appeal (separate written statement)',
    guidance:
      'Only if the appeal is sent more than 2 months after the date of the Local Authority’s letter or one month after the date of the mediation certificate: in writing, the reasons for the delay and why the appeal would succeed if time for making the appeal is extended. The form has no box for this; it goes on a separate sheet.',
    fill: 'model',
    optional: true,
  },
] as const satisfies readonly TribunalFormSectionDef[];

export const SEND28A_SECTIONS = [
  {
    key: 'child',
    heading: 'Section 1 – Young person’s details',
    guidance:
      'Surname, first name(s) and date of birth, from the case record. Gender (male/female) and the home address are not on the case record and are left for the caseworker to confirm.',
    fill: 'record',
  },
  {
    key: 'detention',
    heading: 'Section 1 – Youth accommodation and detention details',
    guidance:
      'Name and address (with postcode) of the youth accommodation at which the young person is detained; date of the sentence, remand or recall order; length of the sentence or detention order; and anticipated date of release — only as the file shows (for example the YOT, the establishment or court papers). The two dates are reported separately.',
    fill: 'model',
  },
  {
    key: 'appeal_type',
    heading: 'Section 2 – What are you appealing against?',
    guidance:
      'Which of the form’s boxes apply, in its words: I (or the person in charge of the custodial establishment) requested an assessment of my EHC needs but the Local Authority refused to secure an EHC needs assessment; the Local Authority has secured an assessment of my EHC needs but refused to make an EHC plan; or the Local Authority made an EHC plan which will come into effect post detention AND I disagree with what the EHC plan says about my educational needs / about the educational help/provision I should receive / I disagree with the school named in Part I of the EHC plan / the Local Authority has not named a school in Part I of the EHC plan — as the decision letter and file show.',
    fill: 'model',
  },
  {
    key: 'reasons',
    heading: 'Section 2 – Reasons (the form’s seven boxes)',
    guidance:
      'One answer per box, only those that apply to the decision appealed: I disagree with the Local Authority’s (LA’s) decision because; I disagree with the description of my difficulties because; My difficulties are; I disagree with the LA description of my educational provision because; The help that I require to learn is; I disagree with the LA’s choice of school/institution because; I prefer my choice of school/institution because. For each: the evidence, its author and date, and what is asked for. Cite every report.',
    fill: 'model',
  },
  {
    key: 'decision',
    heading:
      'Section 3 – Your appeal: local authority and existing claims/appeals',
    guidance:
      'Which local authority made the decision appealed, as the decision letter shows (it should match the local authority on the case record); whether there is another current appeal, with its appeal number; and whether there is an existing disability discrimination claim, with its date and claim number — only as the file shows. The decision letter date is reported separately; the consent questions are for the young person.',
    fill: 'model',
  },
  {
    key: 'support',
    heading: 'Section 4 – The hearing: your needs and requirements',
    guidance:
      'Question 1: any special needs to take into account when arranging the hearing, such as hearing loops or disability access. Question 2: whether an interpreter or signer is needed, with the language or type of sign language and the dialect — as the file shows.',
    fill: 'model',
  },
  {
    key: 'appellant',
    heading: 'Section 5 – Your contact details: Young person',
    guidance:
      'The young person’s own title, surname, first name(s), home address and postcode, daytime and mobile phone numbers and email address — only as the file shows. Do not substitute the parent’s details: the young person is the appellant. Where they are detained, how they can be contacted through the youth accommodation.',
    fill: 'model',
  },
  {
    key: 'people',
    heading: 'Section 5 – Your representative and who receives information',
    guidance:
      'Any representative, including RE-SEND or a parent acting as representative, with name, profession and organisation, address and contact details, and whether they are legally qualified (Yes/No); and who should receive information about the appeal (Young person or Representative — the representative if none is chosen) — only as the file shows.',
    fill: 'model',
  },
  {
    key: 'witnesses',
    heading: 'Section 6 – Witnesses',
    guidance:
      'Up to three witnesses, each with name and profession, as the file shows (for example a teacher, educational psychologist, speech and language therapist or YOT worker).',
    fill: 'model',
  },
  {
    key: 'timing',
    heading: 'Section 9 – Late appeal (separate written statement)',
    guidance:
      'Only if the appeal is sent more than 2 months after the date of the Local Authority’s letter or one month after the date of the mediation certificate: in writing, the reasons for the delay and why the appeal would succeed if time for making the appeal is extended. The form has no box for this; it goes on a separate sheet.',
    fill: 'model',
    optional: true,
  },
] as const satisfies readonly TribunalFormSectionDef[];

export const SEND4A_SECTIONS = [
  {
    key: 'child',
    heading: 'Section 1: Your child’s details',
    guidance:
      'Child’s surname, first name(s), date of birth and gender (Boy/Girl), from the case record; gender is left for the claimant to complete.',
    fill: 'record',
  },
  {
    key: 'appellant',
    heading: 'Section 2: Details of who is making this claim – 1st Claimant',
    guidance:
      'The 1st claimant’s title, surname, first name(s), relationship to the child (e.g. parent, foster parent or person who has care of the child), address and postcode, telephone number(s) and email, from the case record.',
    fill: 'record',
  },
  {
    key: 'people',
    heading:
      'Section 2: Details of who is making this claim – other people, 2nd claimant and representative',
    guidance:
      'Only as the file shows: the name and address of any other person or organisation with parental responsibility, and any reason the Tribunal should not send them details of the claim; a 2nd claimant if a joint claim (title, name, relationship to the child, address, telephone, email); any representative (title, name, professional status such as solicitor or friend, whether legally qualified (Yes/No), address, telephone, email, fax) — including RE-SEND if it is representing; and who should receive information about the claim (tick one: You (1st claimant) or Representative).',
    fill: 'model',
  },
  {
    key: 'school',
    heading: 'Section 3: Details of who the claim is against',
    guidance:
      'The school the claim is against: its full name and address with postcode, and its type using the form’s options (maintained by local authority, stating the name of the authority; academy/free school; or independent (private) school); the email address for the school or the chair/clerk to the governing body, and its telephone number, if known. The claim is registered against the responsible body (normally the governing body for a maintained school or pupil referral unit, or the owner, trustees or governing body for an academy, free school or independent school), never a head teacher or other individual. Use the child’s current school from the case record only if the file shows the claim is about that school; otherwise take the school named in the file. Only as the file shows.',
    fill: 'model',
  },
  {
    key: 'claim',
    heading:
      'Section 5: Information about your claim (and More detail about your claim)',
    guidance:
      'For each heading that applies, using the form’s boxes (up to three entries each), and leaving out any that do not: fixed-term exclusions — the start and end date of each and, briefly, the reasons the school gave; exclusion from school trips or activities — a brief description of each trip or event with the dates of the trip and of any decision about it; unfavourable treatment — each instance described briefly, with dates as precise as the file allows; failure to make reasonable adjustments — the disadvantage to your child, the particular adjustment(s) needed, when they should have been put in place and what was done instead, including the rule, policy or arrangement that caused the disadvantage; other discriminatory act(s) by the school — brief detail with dates. Then, under ‘More detail’, for each claim: what happened, who was involved and when; why it related to your child’s disability (or the disability of someone your child is associated with); how the school should have acted instead; and which documents are important (the documents listed in Section 9). Cite every passage.',
    fill: 'model',
  },
  {
    key: 'disability',
    heading: 'Section 6: Your child’s disability',
    guidance:
      'Your child’s disability and how it affects your child on a day-to-day basis, against the Equality Act 2010 definition: a physical or mental impairment with a substantial (more than minor or trivial) and long-term (12 months or more, or likely to be) adverse effect on the ability to carry out normal day-to-day activities. Name each diagnosis, who made it and when, and refer to the medical or professional diagnosis and any statement of special educational needs or EHC plan, which should be enclosed. If the claim is about discrimination because of another person’s disability (association or perception), give that person’s disability and their relationship to your child. Cite each report, its author and date.',
    fill: 'model',
  },
  {
    key: 'late',
    heading: 'Section 7: Late claims',
    guidance:
      'Only if the claim is or may be late (received more than six months after the date of the discrimination: the date of the act, or the date the school decided not to do something, or for a series of connected acts the most recent one): why the claim is late and why it is important that it should be accepted, setting out any exceptional circumstances, and, where earlier acts are included, why they form part of a continuing course of conduct. If the claim is not late, leave this section blank. The relevant dates are reported separately.',
    fill: 'model',
    optional: true,
  },
  {
    key: 'remedy',
    heading: 'Section 8: Putting things right – governing body or proprietor',
    guidance:
      'What the claimant wants the Tribunal to order if it decides in their favour, and why each order is appropriate. Orders are made against the responsible body (normally the governing body or proprietor), not an individual, and the Tribunal cannot order compensation. Use orders of the kind the Tribunal can make, as the file supports: training of school staff; new guidance for staff; changes to school policies; extra tuition to make up for lost learning; changing the location of lessons or activities (not the physical premises); admission to an independent school that had refused; a written apology to your child; trips or other opportunities to make up for missed activities.',
    fill: 'model',
  },
  {
    key: 'documents',
    heading: 'Section 9: Documents you need to send with your claim',
    guidance:
      'One paragraph per document to send, as a row of the form’s table: its date and number of pages; the name of the person who signed or wrote it (or type of document); and, if not obvious, its relevance. Cover the form’s five kinds where the file has them: (1) documents from the school setting out any decision forming part of the claim (e.g. an exclusion letter from the head teacher, minutes of a meeting); (2) documents that help the Tribunal understand the disability (statement of SEN or EHC plan, medical report, therapist or psychologist assessment); (3) correspondence with the school about the issues in the claim; (4) other educational documents (school reports, individual education plan, school policies); (5) other documents (e.g. a statement from another parent or another organisation). Cite the document itself.',
    fill: 'model',
  },
  {
    key: 'support',
    heading:
      'Section 10: Special requirements (printed as “What is the relevance of document 1”)',
    guidance:
      'Any special requirements of the claimant or another person, including adjustments needed at the place the hearing is held, an interpreter (with language and dialect) or signer, or arrangements so the claimant or child can attend — as the file shows.',
    fill: 'model',
  },
  {
    key: 'other_cases',
    heading: 'Section 11: Other appeal or claim',
    guidance:
      'Whether there is any other claim or appeal with the SEND Tribunal (for example an appeal about the EHC plan or a refusal to assess, or a discrimination claim about another child): No, or Yes with the date sent and the claim/appeal number — only as the file shows.',
    fill: 'model',
  },
] as const satisfies readonly TribunalFormSectionDef[];

export const SEND4B_SECTIONS = [
  {
    key: 'child',
    heading: 'Section 1: About you – your details',
    guidance:
      'The young person’s surname, first name(s) and date of birth, from the case record; title is left for the young person to choose.',
    fill: 'record',
  },
  {
    key: 'contact',
    heading:
      'Section 1: About you – contact details, representative and who receives information',
    guidance:
      'The young person’s own address and postcode, telephone number(s) including any mobile, and email — the case record holds the parent/client’s contact details, so use them only if the file shows the young person is the client or wants papers sent there. Any representative (title, name, professional status such as solicitor or friend, whether legally qualified (Yes/No), address, telephone, email, fax), including RE-SEND or a parent if acting; and who should receive information about the claim (tick one: You or Your Representative) — only as the file shows.',
    fill: 'model',
  },
  {
    key: 'school',
    heading: 'Section 2: Who the claim is against',
    guidance:
      'The school the claim is against: its full name and address with postcode, and its type using the form’s options (maintained by local authority, stating the name of the authority; academy/free school; or private school). The claim is registered against the responsible body (normally the governing body for a maintained school or pupil referral unit, or the owner, trustees or governing body for an academy, free school or independent school), never a head teacher or other individual. Use the child’s current school from the case record only if the file shows the claim is about that school; otherwise take the school named in the file. Only as the file shows.',
    fill: 'model',
  },
  {
    key: 'claim',
    heading:
      'Section 4: Information about your claim (and More detail about your claim)',
    guidance:
      'Written in the first person, as the young person. For each heading that applies, using the form’s boxes (up to three entries each), and leaving out any that do not: fixed-term exclusions — the start and end date of each and, briefly, the reasons the school gave; exclusion from school trips or activities — a brief description of each trip or event with the dates of the trip and of any decision about it; unfavourable treatment — each instance described briefly, with dates as precise as the file allows; failure to make reasonable adjustments — the disadvantage to you, the particular adjustment(s) needed, when they should have been put in place and what was done instead, including the rule, policy or arrangement that caused the disadvantage; other discriminatory act(s) by the school — brief detail with dates. Then, under ‘More detail’, for each claim: what happened, who was involved and when; why it related to your disability (or the disability of someone you are associated with); how the school should have acted instead; and which documents are important (the documents listed in Section 9). Cite every passage.',
    fill: 'model',
  },
  {
    key: 'disability',
    heading: 'Section 6: Your disability',
    guidance:
      'Your (the young person’s) disability and how it affects the young person on a day-to-day basis, against the Equality Act 2010 definition: a physical or mental impairment with a substantial (more than minor or trivial) and long-term (12 months or more, or likely to be) adverse effect on the ability to carry out normal day-to-day activities. Name each diagnosis, who made it and when, and refer to the medical or professional diagnosis and any statement of special educational needs or EHC plan, which should be enclosed. If the claim is about discrimination because of another person’s disability (association or perception), give that person’s disability and their relationship to the young person. Cite each report, its author and date.',
    fill: 'model',
  },
  {
    key: 'late',
    heading: 'Section 7: Late claims',
    guidance:
      'Only if the claim is or may be late (received more than six months after the date of the discrimination: the date of the act, or the date the school decided not to do something, or for a series of connected acts the most recent one): why the claim is late and why it is important that it should be accepted, setting out any exceptional circumstances, and, where earlier acts are included, why they form part of a continuing course of conduct. If the claim is not late, leave this section blank. The relevant dates are reported separately.',
    fill: 'model',
    optional: true,
  },
  {
    key: 'remedy',
    heading: 'Section 8: Putting things right – governing body or proprietor',
    guidance:
      'What the claimant wants the Tribunal to order if it decides in their favour, and why each order is appropriate. Orders are made against the responsible body (normally the governing body or proprietor), not an individual, and the Tribunal cannot order compensation. Use orders of the kind the Tribunal can make, as the file supports: training of school staff; new guidance for staff; changes to school policies; extra tuition to make up for lost learning; changing the location of lessons or activities (not the physical premises); admission to an independent school that had refused; a written apology to the young person; trips or other opportunities to make up for missed activities.',
    fill: 'model',
  },
  {
    key: 'documents',
    heading: 'Section 9: Documents you need to send with your claim',
    guidance:
      'One paragraph per document to send, as a row of the form’s table: its date and number of pages; the name of the person who signed or wrote it (or type of document); and, if not obvious, its relevance. Cover the form’s five kinds where the file has them: (1) documents from the school setting out any decision forming part of the claim (e.g. an exclusion letter from the head teacher, minutes of a meeting); (2) documents that help the Tribunal understand the disability (statement of SEN or EHC plan, medical report, therapist or psychologist assessment); (3) correspondence with the school about the issues in the claim; (4) other educational documents (school reports, individual education plan, school policies); (5) other documents (e.g. a statement from another parent or another organisation). Cite the document itself.',
    fill: 'model',
  },
  {
    key: 'support',
    heading: 'Section 10: Special requirements',
    guidance:
      'Any special requirements of the claimant or another person, including adjustments needed at the place the hearing is held, an interpreter (with language and dialect) or signer, or arrangements so the claimant or child can attend — as the file shows.',
    fill: 'model',
  },
  {
    key: 'other_cases',
    heading: 'Section 11: Other appeal or claim',
    guidance:
      'Whether there is any other claim or appeal with the SEND Tribunal (for example an appeal about the EHC plan or a refusal to assess, or a discrimination claim about another child): No, or Yes with the date sent and the claim/appeal number — only as the file shows.',
    fill: 'model',
  },
] as const satisfies readonly TribunalFormSectionDef[];

export const SEND26A_SECTIONS = [
  {
    key: 'child',
    heading: 'Section 1: Your child’s details',
    guidance:
      'Child’s surname, first name(s), date of birth and gender (Boy/Girl), from the case record; gender is left for the claimant to complete.',
    fill: 'record',
  },
  {
    key: 'school',
    heading: 'Section 2: Details of who the claim is against',
    guidance:
      'The school the claim is against: its full name and address with postcode, and its type using the form’s options (maintained by local authority, stating the name of the authority; academy/free school; or independent (private) school). The claim is registered against the responsible body (normally the governing body for a maintained school or pupil referral unit, or the owner, trustees or governing body for an academy, free school or independent school), never a head teacher or other individual. Use the child’s current school from the case record only if the file shows the claim is about that school; otherwise take the school named in the file. Only as the file shows.',
    fill: 'model',
  },
  {
    key: 'appellant',
    heading: 'Section 3: Details of who is making this claim – 1st Claimant',
    guidance:
      'The 1st claimant’s title, surname, first name(s), relationship to the child (e.g. parent, guardian, foster parent or person who has care of the child), address and postcode, telephone number(s) including any mobile, and email, from the case record.',
    fill: 'record',
  },
  {
    key: 'people',
    heading:
      'Section 3: Details of who is making this claim – other people, 2nd claimant and representative',
    guidance:
      'Only as the file shows: the name and address of any other person or organisation who shares parental responsibility, and any reason the Tribunal should not send them details of the claim; a 2nd claimant if a joint claim (title, name, relationship to the child, address, telephone, email); any representative (title, name, professional status such as solicitor or friend, whether legally qualified (Yes/No), address, telephone including mobile, email, fax), including RE-SEND if representing; and who should receive information about the claim (tick one: You (1st claimant), 2nd Claimant or Representative — papers go to one person only).',
    fill: 'model',
  },
  {
    key: 'exclusion',
    heading: 'Section 4: Information about your child’s exclusion',
    guidance:
      'Independent Review Panel: whether the claimant has applied to an IRP for a review of the decision (Yes/No); if Yes, whether the panel has made a decision or recommendation (Yes/No — if No the claim cannot be fast-tracked and is put on hold until the panel’s decision is known); and if it has, what the IRP decided and what action the school has taken in response. Then more information about the exclusion, one passage each: the reasons given by the Head (or member of staff) for the permanent exclusion, and the claimant’s comments on them; the reasons given by the governing body for upholding the exclusion, and the claimant’s comments; why the permanent exclusion is connected to your child’s disability (for example behaviour arising from it, or support or adjustments that were not in place); and why the exclusion was wrong. Cite the exclusion letter, the governing body’s decision and any IRP decision.',
    fill: 'model',
  },
  {
    key: 'other_claims',
    heading:
      'Section 5: Are you making any other claims against this school? (and More detail about your other claims)',
    guidance:
      'Only if the school discriminated against the child in other ways, not just by the permanent exclusion; otherwise leave blank. For each heading that applies, using the form’s boxes (up to three entries each), and leaving out any that do not: fixed-term exclusions — the start and end date of each and, briefly, the reasons the school gave; exclusion from school trips or activities — a brief description of each trip or event with the dates of the trip and of any decision about it; unfavourable treatment — each instance described briefly, with dates as precise as the file allows; failure to make reasonable adjustments — the disadvantage to your child, the particular adjustment(s) needed, when they should have been put in place and what was done instead, including the rule, policy or arrangement that caused the disadvantage; other discriminatory act(s) by the school — brief detail with dates. Then, under ‘More detail’, for each claim: what happened, who was involved and when; why it related to your child’s disability (or the disability of someone your child is associated with); how the school should have acted instead; and which documents are important (the documents listed in Section 9). Cite every passage.',
    fill: 'model',
    optional: true,
  },
  {
    key: 'late',
    heading: 'Section 6: Late claims',
    guidance:
      'Only if the claim is or may be late (received more than six months after the date of the discrimination: the date of the act, or the date the school decided not to do something, or for a series of connected acts the most recent one; for the permanent exclusion, six months from the date the governing body upheld it or, if applicable, the date the Independent Review Panel sent its decision): why the claim is late and why it is important that it should be accepted, setting out any exceptional circumstances, and, where earlier acts are included, why they form part of a continuing course of conduct. If the claim is not late, leave this section blank. The relevant dates are reported separately.',
    fill: 'model',
    optional: true,
  },
  {
    key: 'disability',
    heading: 'Section 7: Your child’s disability',
    guidance:
      'Your child’s disability and how it affects your child on a day-to-day basis, against the Equality Act 2010 definition: a physical or mental impairment with a substantial (more than minor or trivial) and long-term (12 months or more, or likely to be) adverse effect on the ability to carry out normal day-to-day activities. Name each diagnosis, who made it and when, and refer to the medical or professional diagnosis and any statement of special educational needs or EHC plan, which should be enclosed. If the claim is about discrimination because of another person’s disability (association or perception), give that person’s disability and their relationship to the child (the form says “to you”). Cite each report, its author and date.',
    fill: 'model',
  },
  {
    key: 'remedy',
    heading: 'Section 8: Putting things right – governing body or proprietor',
    guidance:
      'What the claimant wants the Tribunal to order if it decides in their favour, and why each order is appropriate. Orders are made against the responsible body (normally the governing body or proprietor), not an individual, and the Tribunal cannot order compensation. Lead with reinstatement at the school, then any other orders. Use orders of the kind the Tribunal can make, as the file supports: training of school staff; new guidance for staff; changes to school policies; extra tuition to make up for lost learning; changing the location of lessons or activities (not the physical premises); admission to an independent school that had refused; a written apology to your child; trips or other opportunities to make up for missed activities.',
    fill: 'model',
  },
  {
    key: 'documents',
    heading: 'Section 9: Documents you need to send with your claim',
    guidance:
      'One paragraph per document to send, as a row of the form’s table: its date and number of pages; the name of the person who signed or wrote it (or type of document); and, if not obvious, its relevance. Cover the form’s five kinds where the file has them: (1) documents from the school setting out any decision forming part of the claim (e.g. an exclusion letter from the head teacher, minutes of a meeting); (2) documents that help the Tribunal understand the disability (statement of SEN or EHC plan, medical report, therapist or psychologist assessment); (3) correspondence with the school about the issues in the claim; (4) other educational documents (school reports, individual education plan, school policies); (5) other documents (e.g. a statement from another parent or another organisation). The exclusion documents (1 and 2) must be included or the reason they cannot be explained. Cite the document itself.',
    fill: 'model',
  },
  {
    key: 'witnesses',
    heading: 'Section 10: Witnesses and representative at the hearing',
    guidance:
      'No more than five witnesses the claimant intends to ask to give evidence at the hearing, each with name and the reason for calling them, i.e. why their evidence is relevant (e.g. “She is a speech and language therapist and can explain my difficulties with communication”); and the name and profession of the person (if any) who will represent the claimant at the hearing — only as the file shows. The Tribunal normally allows only two witnesses per party in an expedited claim, so list the two most important first.',
    fill: 'model',
  },
  {
    key: 'support',
    heading: 'Section 11: Special requirements',
    guidance:
      'Any special requirements of the claimant or another person, including adjustments needed at the place the hearing is held, an interpreter (with language and dialect) or signer, or arrangements so the claimant or child can attend — as the file shows.',
    fill: 'model',
  },
  {
    key: 'other_cases',
    heading: 'Section 12: Other appeal or claim',
    guidance:
      'Whether there is any other claim or appeal with the SEND Tribunal (for example an appeal about the EHC plan or a refusal to assess, or a discrimination claim about another child): No, or Yes with the date sent and the claim/appeal number — only as the file shows.',
    fill: 'model',
  },
] as const satisfies readonly TribunalFormSectionDef[];

export const SEND26B_SECTIONS = [
  {
    key: 'child',
    heading: 'Section 1: About you – your details',
    guidance:
      'The young person’s surname, first name(s), date of birth and gender (Male/Female), from the case record; title and gender are left for the young person to complete.',
    fill: 'record',
  },
  {
    key: 'contact',
    heading:
      'Section 1: About you – contact details, representative and who receives information',
    guidance:
      'The young person’s own address and postcode, telephone number(s) including any mobile, and email — the case record holds the parent/client’s contact details, so use them only if the file shows the young person is the client or wants papers sent there. Any representative (title, name, professional status such as solicitor or friend, whether legally qualified (Yes/No), address, telephone, email, fax), including RE-SEND or a parent if acting; and who should receive information about the claim (tick one: You or Your Representative) — only as the file shows.',
    fill: 'model',
  },
  {
    key: 'school',
    heading: 'Section 2: Details of who the claim is against',
    guidance:
      'The school the claim is against: its full name and address with postcode, and its type using the form’s options (maintained by local authority, stating the name of the authority; academy/free school; or independent (private) school). The claim is registered against the responsible body (normally the governing body for a maintained school or pupil referral unit, or the owner, trustees or governing body for an academy, free school or independent school), never a head teacher or other individual. Use the child’s current school from the case record only if the file shows the claim is about that school; otherwise take the school named in the file. Only as the file shows.',
    fill: 'model',
  },
  {
    key: 'exclusion',
    heading: 'Section 3: Information about your exclusion',
    guidance:
      'Written in the first person, as the young person. Independent Review Panel: whether the claimant has applied to an IRP for a review of the decision (Yes/No); if Yes, whether the panel has made a decision or recommendation (Yes/No — if No the claim cannot be fast-tracked and is put on hold until the panel’s decision is known); and if it has, what the IRP decided and what action the school has taken in response. Then more information about the exclusion, one passage each: the reasons given by the Head (or member of staff) for the permanent exclusion, and the claimant’s comments on them; the reasons given by the governing body for upholding the exclusion, and the claimant’s comments; why the permanent exclusion is connected to your disability (for example behaviour arising from it, or support or adjustments that were not in place); and why the exclusion was wrong. Cite the exclusion letter, the governing body’s decision and any IRP decision.',
    fill: 'model',
  },
  {
    key: 'other_claims',
    heading:
      'Section 4: Are you making any other claims against this school? (and More detail about your other claims)',
    guidance:
      'Do not complete any of Section 4 if the only claim relates to the permanent exclusion. Written in the first person. For each heading that applies, using the form’s boxes (up to three entries each), and leaving out any that do not: fixed-term exclusions — the start and end date of each and, briefly, the reasons the school gave; exclusion from school trips or activities — a brief description of each trip or event with the dates of the trip and of any decision about it; unfavourable treatment — each instance described briefly, with dates as precise as the file allows; failure to make reasonable adjustments — the disadvantage to you, the particular adjustment(s) needed, when they should have been put in place and what was done instead, including the rule, policy or arrangement that caused the disadvantage; other discriminatory act(s) by the school — brief detail with dates. Then, under ‘More detail’, for each claim: what happened, who was involved and when; why it related to your disability (or the disability of someone you are associated with); how the school should have acted instead; and which documents are important (the documents listed in Section 8). Cite every passage.',
    fill: 'model',
    optional: true,
  },
  {
    key: 'disability',
    heading: 'Section 5: Your disability',
    guidance:
      'Your (the young person’s) disability and how it affects the young person on a day-to-day basis, against the Equality Act 2010 definition: a physical or mental impairment with a substantial (more than minor or trivial) and long-term (12 months or more, or likely to be) adverse effect on the ability to carry out normal day-to-day activities. Name each diagnosis, who made it and when, and refer to the medical or professional diagnosis and any statement of special educational needs or EHC plan, which should be enclosed. If the claim is about discrimination because of another person’s disability (association or perception), give that person’s disability and their relationship to the young person. Cite each report, its author and date.',
    fill: 'model',
  },
  {
    key: 'late',
    heading: 'Section 6: Late claims',
    guidance:
      'Only if the claim is or may be late (received more than six months after the date of the discrimination: the date of the act, or the date the school decided not to do something, or for a series of connected acts the most recent one; for the permanent exclusion, six months from the date the governing body upheld it or, if applicable, the date the Independent Review Panel sent its decision): why the claim is late and why it is important that it should be accepted, setting out any exceptional circumstances, and, where earlier acts are included, why they form part of a continuing course of conduct. If the claim is not late, leave this section blank. The relevant dates are reported separately.',
    fill: 'model',
    optional: true,
  },
  {
    key: 'remedy',
    heading: 'Section 7: Putting things right – governing body or proprietor',
    guidance:
      'What the claimant wants the Tribunal to order if it decides in their favour, and why each order is appropriate. Orders are made against the responsible body (normally the governing body or proprietor), not an individual, and the Tribunal cannot order compensation. Lead with reinstatement at the school, then any other orders. Use orders of the kind the Tribunal can make, as the file supports: training of school staff; new guidance for staff; changes to school policies; extra tuition to make up for lost learning; changing the location of lessons or activities (not the physical premises); admission to an independent school that had refused; a written apology to the young person; trips or other opportunities to make up for missed activities.',
    fill: 'model',
  },
  {
    key: 'documents',
    heading: 'Section 8: Documents you need to send with your claim',
    guidance:
      'One paragraph per document to send, as a row of the form’s table: its date and number of pages; the name of the person who signed or wrote it (or type of document); and, if not obvious, its relevance. Cover the form’s five kinds where the file has them: (1) documents from the school setting out any decision forming part of the claim (e.g. an exclusion letter from the head teacher, minutes of a meeting); (2) documents that help the Tribunal understand the disability (statement of SEN or EHC plan, medical report, therapist or psychologist assessment); (3) correspondence with the school about the issues in the claim; (4) other educational documents (school reports, individual education plan, school policies); (5) other documents (e.g. a statement from another parent or another organisation). The exclusion documents (1 and 2) must be included or the reason they cannot be explained. Cite the document itself.',
    fill: 'model',
  },
  {
    key: 'support',
    heading: 'Section 9: Special requirements',
    guidance:
      'Any special requirements of the claimant or another person, including adjustments needed at the place the hearing is held, an interpreter (with language and dialect) or signer, or arrangements so the claimant or child can attend — as the file shows.',
    fill: 'model',
  },
  {
    key: 'other_cases',
    heading: 'Section 10: Other appeal or claim',
    guidance:
      'Whether there is any other claim or appeal with the SEND Tribunal (for example an appeal about the EHC plan or a refusal to assess, or a discrimination claim about another child): No, or Yes with the date sent and the claim/appeal number — only as the file shows.',
    fill: 'model',
  },
] as const satisfies readonly TribunalFormSectionDef[];

export const SEND8_SECTIONS = [
  {
    key: 'details',
    heading: 'Case details',
    guidance:
      'Appeal/claim number, name of local authority or responsible body, name of child/young person and hearing date, from the case record.',
    fill: 'record',
  },
  {
    key: 'signatories',
    heading:
      'You must fill in this section – Name of parent/young person; Name of parent',
    guidance:
      'The name of the parent or young person withdrawing, from the case record. The notice must be signed by the same person (or people) who signed the notice of appeal or claim form; a second parent is named only if they signed the original appeal, which the caseworker adds.',
    fill: 'record',
    builder: 'names',
  },
  {
    key: 'reason',
    heading: 'For monitoring purposes – why you want to withdraw your appeal',
    guidance:
      'Which one box best fits, using the form’s options: The local authority have agreed with my appeal; I have changed my mind; I have reached an agreement with the local authority/responsible body; I have reached an agreement with the local authority/responsible body using a disagreement resolution or mediation service; Another reason (with details). Choose only as the file supports it — for example the local authority’s letter or email conceding the appeal, or a mediation outcome — and cite it. If “Another reason”, give brief, factual details. This section is optional on the form.',
    fill: 'model',
  },
] as const satisfies readonly TribunalFormSectionDef[];

export const SEND11_SECTIONS = [
  {
    key: 'details',
    heading: 'Case details',
    guidance: 'Child’s name and appeal/claim number, from the case record.',
    fill: 'record',
  },
  {
    key: 'appellant',
    heading: 'Full name of parent 1',
    guidance: 'The name of the parent from the case record.',
    fill: 'record',
    builder: 'names',
  },
  {
    key: 'parent2',
    heading: 'Full name of parent 2',
    guidance:
      'A second parent, only if the file shows another parent is party to the appeal and will attend; otherwise leave blank.',
    fill: 'model',
  },
  {
    key: 'child',
    heading: 'Is the child attending the hearing?',
    guidance:
      'Yes or No, only as the file shows the parents’ intention. If Yes, note from the file who will look after the child while they are not in the hearing room — Tribunal staff cannot.',
    fill: 'model',
  },
  {
    key: 'representative',
    heading: 'Name of representative or helper; Profession',
    guidance:
      'The name and profession of anyone representing or helping the parents at the hearing (for example a RE-SEND caseworker or volunteer, a solicitor or counsel), as the file shows. If not yet known, say so — the name must be given before the hearing.',
    fill: 'model',
  },
  {
    key: 'witnesses',
    heading: 'Name of first, second and third witness; Occupation',
    guidance:
      'Up to three witnesses the parents want to give evidence, each with their name and occupation (for example educational psychologist, speech and language therapist, current teacher), only as the file shows them agreed to attend. Prefer people who know the child and can speak to the areas of dispute. Any more than three need a request on form SEND7.',
    fill: 'model',
  },
  {
    key: 'support',
    heading: 'Special requirements',
    guidance:
      'Any special requirements the parents or their witnesses have for the hearing — access needs, an interpreter or signer with language and dialect, breaks, or attending by video — as the file shows.',
    fill: 'model',
  },
] as const satisfies readonly TribunalFormSectionDef[];

export const SEND11YP_SECTIONS = [
  {
    key: 'details',
    heading: 'Section 1: Personal details',
    guidance:
      'Your full name (the young person) and appeal/claim number, from the case record.',
    fill: 'record',
  },
  {
    key: 'representative',
    heading: 'Section 2: Representative or helper',
    guidance:
      'Name and profession of anyone representing or helping the young person at the hearing (for example a RE-SEND caseworker, an advocate, a solicitor), as the file shows. If not yet known, say so — the name must be given before the hearing.',
    fill: 'model',
  },
  {
    key: 'witnesses',
    heading: 'Section 3: Witnesses',
    guidance:
      'Name and occupation of the first, second and third witness the young person wants to give evidence, only as the file shows them agreed to attend; people who know the young person and can speak to the areas of dispute. Any more than three need a request on form SEND7.',
    fill: 'model',
  },
  {
    key: 'support',
    heading: 'Section 4: Special requirements',
    guidance:
      'Any special requirements the young person or their witnesses have for the hearing — access needs, an interpreter or signer with language and dialect, breaks, a supporter, or attending by video — as the file shows.',
    fill: 'model',
  },
] as const satisfies readonly TribunalFormSectionDef[];

export const SEND30_SECTIONS = [
  {
    key: 'details',
    heading: 'Your details – Appeal number',
    guidance:
      'The appeal number, from the case record (the final hearing date is used to check the 14-day service deadline).',
    fill: 'record',
  },
  {
    key: 'requester',
    heading: 'Your details – Your name and your status in the appeal',
    guidance:
      'The name of the person making this request and their status in the appeal (for example appellant/parent, or representative), as the file shows — normally the parent on the case record, or RE-SEND if it represents them. The date of request is completed when the form is sent.',
    fill: 'model',
  },
  {
    key: 'witness',
    heading: 'Details of your witness',
    guidance:
      'The witness’s title, first name, surname/family name, address with postcode, and occupation — only as the file shows (for example from their report or correspondence). Use a work address where that is what the file holds.',
    fill: 'model',
  },
  {
    key: 'reasons',
    heading: 'Your reasons for requesting a witness summons',
    guidance:
      "Which of the form’s items apply (tick all relevant): they have refused to attend (with copies of the relevant letters/emails); they have already provided a statement of the evidence; they have been requested that they provide evidence in another way, such as phone or videolink. Then complete both statements: 'I consider that their personal attendance at the final hearing of the appeal is necessary because…' and 'The evidence that they can provide is necessary because…' — what the witness knows, which issue in dispute it goes to, and why no other way of giving it will do. Cite each request and refusal.",
    fill: 'model',
  },
] as const satisfies readonly TribunalFormSectionDef[];

export const SEND15A_SECTIONS = [
  {
    key: 'appellant',
    heading: 'Section 1: Personal details',
    guidance:
      'Surname, first name(s), home telephone number, home address and postcode of the parent claiming, from the case record. To be written in capital letters.',
    fill: 'record',
  },
  {
    key: 'details',
    heading: 'Section 3: Hearing details',
    guidance:
      'Date of hearing, appeal/claim number and full name of child (surname and first names), from the case record. The full name of the carer is added by hand.',
    fill: 'record',
  },
  {
    key: 'travel',
    heading: 'Section 4: Travel expenses',
    guidance:
      'Date of hearing (the final hearing date from the case record, or the date actually attended if the file shows a change). Method of transport, using the form’s options: Bus, Train, Car, or Other (please specify). Where the parent’s journey started and where it ended — the hearing venue, as the hearing notice or directions in the file show it. Do not state miles travelled or the amount claimed unless the claimant has given those figures in the file; never calculate a claim from estimated distances.',
    fill: 'model',
  },
] as const satisfies readonly TribunalFormSectionDef[];

export const SEND15AYP_SECTIONS = [
  {
    key: 'details',
    heading: 'Section 3: Hearing details',
    guidance:
      'Date of hearing, appeal/claim number and your full name (the young person: surname and first names), from the case record.',
    fill: 'record',
  },
  {
    key: 'travel',
    heading: 'Section 4: Travel expenses',
    guidance:
      'Date of hearing (the final hearing date from the case record, or the date actually attended if the file shows a change). Method of transport, using the form’s options: Bus, Train, Car, or Other (please specify). Where the young person’s journey started and where it ended — the hearing venue, as the hearing notice or directions in the file show it. Do not state miles travelled or the amount claimed unless the claimant has given those figures in the file; never calculate a claim from estimated distances.',
    fill: 'model',
  },
  {
    key: 'missing',
    heading:
      'Section 4: If you are making a claim with missing tickets/receipts please explain why?',
    guidance:
      'Only if the file shows a ticket or receipt is missing: which one (bus, train or other) and the reason the young person has given, in their words where possible. Otherwise leave blank.',
    fill: 'model',
  },
] as const satisfies readonly TribunalFormSectionDef[];

export const SEND16A_SECTIONS = [
  {
    key: 'witness',
    heading: 'Section 1: Personal details',
    guidance:
      'The witness’s surname and first name(s), as the file shows them (for example from the SEND11 attendance form or their report). Their home telephone number, home address and postcode are left for the witness to complete.',
    fill: 'model',
  },
  {
    key: 'details',
    heading: 'Section 3: Hearing details',
    guidance:
      'Date of hearing, appeal/claim number and full name of child (surname and first names), from the case record.',
    fill: 'record',
  },
  {
    key: 'travel',
    heading: 'Section 4: Travel expenses',
    guidance:
      'Date of hearing (the final hearing date from the case record, or the date actually attended if the file shows a change). Method of transport, using the form’s options: Bus, Train, Car, or Other (please specify). Where the witness’s journey started and where it ended — the hearing venue, as the hearing notice or directions in the file show it. Do not state miles travelled or the amount claimed unless the claimant has given those figures in the file; never calculate a claim from estimated distances.',
    fill: 'model',
  },
  {
    key: 'earnings',
    heading: 'Section 5: Claim for loss of earnings',
    guidance:
      'Only claim if the witness had a loss of earnings that was not made good before or after the hearing. Their occupation and employer’s name and address, as the file shows them. Number of hours lost, using the form’s options: Up to 4 hours absence (paid £32.47) or Over 4 hours absence (paid £64.95) — only if the witness has said so. The Tribunal may contact the employer.',
    fill: 'model',
  },
] as const satisfies readonly TribunalFormSectionDef[];

export const SEND17_SECTIONS = [
  {
    key: 'declaration',
    heading:
      'Declaration – Your name; I have not been able to provide the following tickets or receipts for; The reasons for this are',
    guidance:
      'The name of the person making the expenses claim (the parent, or the witness on SEND16A). Which tickets or receipts are missing, using the form’s options: Bus, Train, Other (please specify). The reasons, in the claimant’s own account as the file records it (for example an email saying a ticket was lost or a contactless fare left no receipt), cited.',
    fill: 'model',
  },
] as const satisfies readonly TribunalFormSectionDef[];

export const SEND20A_SECTIONS = [
  {
    key: 'appellant',
    heading:
      'Section A – About the applicant: Parent One (or person with parental responsibility)',
    guidance:
      'Whether the applicant is a parent or the person with parental responsibility (rather than a local authority or a responsible body), and Parent One’s title, surname, first name(s), home address and postcode, daytime, evening and mobile phone numbers and email address, from the case record. If the applicant is not a parent, their relationship to the child.',
    fill: 'record',
  },
  {
    key: 'people',
    heading:
      'Section A – Parent Two, representative and who should receive information',
    guidance:
      'Only what the file shows: Parent Two’s details; any representative, including RE-SEND (title, name, profession/organisation, address, phone and email) and whether they are a legal representative (Yes/No); and who should receive information about the application (Parent one/person with parental responsibility, Parent two, or Representative). The form warns that papers go to only one person — to the representative if none is chosen, otherwise to the first named parent. The local authority or responsible body part of Section A is not used for a parent’s application.',
    fill: 'model',
  },
  {
    key: 'details',
    heading:
      'Section B – About the decision you are making the application about',
    guidance:
      'Appeal or claim number, name of the child who was the subject of the appeal or claim, name of the local authority or responsible body who was a party, and the date of the hearing (the final hearing key date), from the case record. The date the decision was sent by the Tribunal is reported separately.',
    fill: 'record',
  },
  {
    key: 'late',
    heading: 'Section B – Reasons for delay',
    guidance:
      'Only if the application is or may be made more than 28 days after the decision was sent: the reasons for the delay in sending the application, from the file.',
    fill: 'model',
    optional: true,
  },
  {
    key: 'grounds',
    heading:
      'Section C – You should explain why you think that the Tribunal decision is wrong in law',
    guidance:
      'Each error of law in the decision, one paragraph each: the paragraph or finding of the written decision concerned, what the Tribunal did wrong in law (for example misapplied or misunderstood the law, failed to give adequate reasons, took account of something irrelevant or ignored something relevant, made a finding no evidence supported, or acted unfairly in the procedure), and why it matters to the outcome. Disagreement with the Tribunal’s view of the evidence is not enough on its own. Cite the decision paragraph and the evidence relied on.',
    fill: 'model',
  },
  {
    key: 'result',
    heading:
      'Section D – What result are you looking for in making this application?',
    guidance:
      'What the applicant wants: permission to appeal to the Upper Tribunal, and the outcome sought from the appeal (for example that the decision, or a part of it, be set aside and the case sent back to a fresh tribunal, or that the Upper Tribunal remake it to say what the applicant asks for), as the file shows.',
    fill: 'model',
  },
] as const satisfies readonly TribunalFormSectionDef[];

export const SEND20B_SECTIONS = [
  {
    key: 'appellant',
    heading:
      'Section A – About the applicant: Parent One (or person with parental responsibility)',
    guidance:
      'Whether the applicant is a parent or the person with parental responsibility (rather than a local authority), and Parent One’s title, surname, first name(s), home address and postcode, daytime, evening and mobile phone numbers and email address, from the case record. If the applicant is not a parent, their relationship to the child.',
    fill: 'record',
  },
  {
    key: 'people',
    heading:
      'Section A – Parent Two, representative and who should receive information',
    guidance:
      'Only what the file shows: Parent Two’s details; any representative, including RE-SEND (title, name, profession/organisation, address, phone and email) and whether they are a legal representative (Yes/No); and who should receive information about the application (Parent one/person with parental responsibility, Parent two, or Representative). The form warns that papers go to only one person — to the representative if none is chosen, otherwise to the first named parent. The local authority part of Section A is not used for a parent’s application.',
    fill: 'model',
  },
  {
    key: 'details',
    heading:
      'Section B – About the decision you are making the application about',
    guidance:
      'Appeal or claim number, name of the child who was the subject of the appeal or claim, name of the local authority who was a party, and the date of the hearing (the final hearing key date), from the case record. The date the decision was sent by the Tribunal is reported separately.',
    fill: 'record',
  },
  {
    key: 'late',
    heading: 'Section B – Reasons for delay',
    guidance:
      'Only if the application is or may be made more than 28 days after the decision was sent: the reasons for the delay in sending the application, from the file.',
    fill: 'model',
    optional: true,
  },
  {
    key: 'grounds',
    heading: 'Section C – About your application',
    guidance:
      'What relevant circumstances have changed since the decision was made, and why the Tribunal should amend its decision: each change in turn — what it is, when it happened and how the file shows it (for example a new diagnosis or report, a change of placement, or a school’s offer or refusal of a place), how it bears on what the decision ordered, and what amendment is asked for. Cite the document showing each change.',
    fill: 'model',
  },
] as const satisfies readonly TribunalFormSectionDef[];

export const SEND20C_SECTIONS = [
  {
    key: 'appellant',
    heading:
      'Section A – About the applicant: Parent One (or person with parental responsibility)',
    guidance:
      'Whether the applicant is a parent or the person with parental responsibility (rather than a local authority or a responsible body), and Parent One’s title, surname, first name(s), home address and postcode, daytime, evening and mobile phone numbers and email address, from the case record. If the applicant is not a parent, their relationship to the child.',
    fill: 'record',
  },
  {
    key: 'people',
    heading:
      'Section A – Parent Two, representative and who should receive information',
    guidance:
      'Only what the file shows: Parent Two’s details; any representative, including RE-SEND (title, name, profession/organisation, address, phone and email) and whether they are a legal representative (Yes/No); and who should receive information about the application (Parent one/person with parental responsibility, Parent two, or Representative). The form warns that papers go to only one person — to the representative if none is chosen, otherwise to the first named parent. The local authority or responsible body part of Section A is not used for a parent’s application.',
    fill: 'model',
  },
  {
    key: 'details',
    heading:
      'Section B – About the decision you are making the application about',
    guidance:
      'Appeal or claim number, name of the child who was the subject of the appeal or claim, name of the local authority or responsible body who was a party, and the date of the hearing (the final hearing key date), from the case record. The date the decision was sent by the Tribunal is reported separately.',
    fill: 'record',
  },
  {
    key: 'late',
    heading: 'Section B – Reasons for delay',
    guidance:
      'Only if the application is or may be made more than 28 days after the decision was sent: the reasons for the delay in sending the application, from the file.',
    fill: 'model',
    optional: true,
  },
  {
    key: 'grounds',
    heading:
      'Section B – Grounds for setting aside: what happened and why it is in the interests of justice',
    guidance:
      'Which of the form’s grounds apply, in its words: a document relating to the proceedings was not sent to, or was not received at an appropriate time by, me/us or my/our representative; I/we, or my/our representative, was not present at a hearing related to the proceedings; or there has been some other procedural irregularity in the proceedings. Then what happened, with dates, and why it is in the interests of justice for the Tribunal to set aside its decision. If only a part of the decision is to be set aside, which part. Cite the emails, letters or notes that show what happened.',
    fill: 'model',
  },
] as const satisfies readonly TribunalFormSectionDef[];

/** A date a form's answers depend on, found by the model with its sources. */
export interface TribunalFormDateDef {
  key: string;
  /** How it is reported on the draft. */
  label: string;
  /** What the model is to look for. */
  find: string;
}

/** How the forms are grouped where a caseworker chooses one, in order. */
export const TRIBUNAL_FORM_GROUPS = [
  { id: 'appeal', label: 'Starting an appeal' },
  { id: 'claim', label: 'Disability discrimination claims' },
  { id: 'during', label: 'During an appeal or claim' },
  { id: 'after', label: 'After the hearing or decision' },
] as const;
export type TribunalFormGroup = (typeof TRIBUNAL_FORM_GROUPS)[number]['id'];

/**
 * Each Tribunal form the drafting tools fill in. When HMCTS issues a new
 * version of a form, update its version and sections here to match.
 */
export interface TribunalFormDef {
  code: string;
  group: TribunalFormGroup;
  version: string;
  guidanceUrl: string;
  onlineUrl: string | null;
  sections: readonly TribunalFormSectionDef[];
  /** Dates the model finds, reported in `datesSection`. */
  dates: readonly TribunalFormDateDef[];
  datesSection: string | null;
  /**
   * What the dates decide, worked out whenever the draft is read: the appeal
   * time limit, or the earliest a request can be sent (SEND7).
   */
  timing:
    | { rule: 'appeal'; lateQuestion: string }
    | { rule: 'notice' }
    | {
        /**
         * A time limit counted from a date the model finds, or from the
         * final hearing ('hearing'); negative counts are before it.
         */
        rule: 'limit';
        /** A date key, or several in order of preference (the first found). */
        from: string | readonly string[];
        add: { months?: number; days?: number; workingDays?: number };
        /** Where the form asks why it is late (or null if it does not). */
        lateQuestion: string | null;
        /** The rule in words, e.g. "28 days from the date the decision was sent". */
        describe: string;
        /**
         * A statutory period "starting with" the date (Equality Act claims):
         * the last day is the day before the same date N months on, and it is
         * not moved off a weekend. Otherwise the Tribunal's rule applies: the
         * period runs from the date and a last day on a weekend or bank
         * holiday moves to the next working day.
         */
        startingWith?: boolean;
        /** Said when the limit is counted from a later-preferred date that is absent. */
        fallbackNote?: string;
      }
    | null;
  /** What the appellant (or the caseworker) must still do, on every draft. */
  checklist: readonly string[];
  /** What the "details" record section copies, beyond the name and appeal number. */
  details?: {
    localAuthority?: boolean;
    /** The form asks for the "local authority or responsible body". */
    responsibleBody?: boolean;
    finalHearing?: boolean;
    /** The date the form is due (SEND45: the case review form date). */
    dueDate?: boolean;
    school?: boolean;
  };
  /** Warn when the young person is over the Tribunal's age limit (new appeals and claims). */
  ageLimit?: boolean;
}

export const TRIBUNAL_FORMS: Record<TribunalFormKind, TribunalFormDef> = {
  send35_appeal: {
    code: 'SEND35',
    group: 'appeal',
    version: SEND35_FORM.version,
    guidanceUrl: SEND35_FORM.guidanceUrl,
    onlineUrl: SEND35_FORM.onlineUrl,
    sections: SEND35_SECTIONS,
    dates: [
      {
        key: 'decisionLetter',
        label: '13.1 Date on the local authority decision letter',
        find: 'the date on the local authority’s decision letter that is being appealed',
      },
      {
        key: 'mediationCertificate',
        label: '13.2 Date on the mediation certificate',
        find: 'the date on the mediation certificate',
      },
    ],
    datesSection: 'timing',
    timing: { rule: 'appeal', lateQuestion: 'Question 13.3' },
    checklist: SEND35_APPELLANT_CHECKLIST,
    ageLimit: true,
  },
  send35a_appeal: {
    code: 'SEND35A',
    group: 'appeal',
    version: 'Version 04.23',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send35a-special-educational-needs-and-disability-tribunal-appeal-a-refusal-to-secure-an-ehc-needs-assessment',
    onlineUrl: null,
    sections: SEND35A_SECTIONS,
    dates: [
      {
        key: 'decisionLetter',
        label: 'Date on the decision letter from the local authority',
        find: 'the date on the local authority’s letter refusing to secure an EHC needs assessment',
      },
      {
        key: 'mediationCertificate',
        label: 'Date on the mediation certificate',
        find: 'the date on the mediation certificate',
      },
    ],
    datesSection: 'decision',
    timing: {
      rule: 'appeal',
      lateQuestion: 'Section 3 (“My appeal is being made late”)',
    },
    ageLimit: true,
    checklist: [
      'Section 4: whether to consent to the appeal being decided on the papers without a hearing is for the appellant to choose (consent is presumed unless they say otherwise).',
      'Section 8 checklist — send with the form: the local authority’s signed and dated decision letter, the signed mediation certificate, and the reasons for appealing.',
      'Section 9: the form is signed and dated by the parent or young person (or their representative).',
      'If the decision was about the contents of an EHC plan, or a refusal to issue one, the SEND35 form is used instead.',
    ],
  },
  send7_request: {
    code: 'SEND7',
    group: 'during',
    version: 'Version 08.23',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send7-request-for-change',
    onlineUrl: null,
    sections: SEND7_SECTIONS,
    dates: [
      {
        key: 'otherPartyNotified',
        label: 'Date request sent to other party',
        find: 'the date the local authority (the other party) was told about this request',
      },
    ],
    datesSection: 'details',
    timing: { rule: 'notice' },
    details: { localAuthority: true, finalHearing: true },
    checklist: [
      'Tick the box on the form if the hearing has been adjourned before.',
      'The form is signed and dated, with “Request made by” ticked (parent, or parent’s representative).',
      'Send the completed form, with the local authority’s response and any supporting documents, to the Tribunal and to the local authority at the same time — otherwise it is returned unconsidered.',
    ],
  },
  send45_case_review: {
    code: 'SEND45',
    group: 'during',
    version: 'Version 11.23',
    guidanceUrl:
      'https://www.gov.uk/government/publications/report-issues-with-a-case-to-the-tribunal-form-send45',
    onlineUrl: null,
    sections: SEND45_SECTIONS,
    dates: [],
    datesSection: null,
    timing: null,
    details: { dueDate: true },
    checklist: [
      'Question 14: whether to consent to the appeal being decided on the papers is for the appellant to choose.',
      'Question 15: anything else to tell the Tribunal about the hearing.',
      'Question 16: the form is signed, and sent to the Tribunal by the bundle deadline in the case directions — with the latest working document, if there is one.',
    ],
  },
  send28_appeal: {
    code: 'SEND28',
    group: 'appeal',
    version: 'Version 04.23',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send28-appeal-form-child-detained-in-youth-accommodation',
    onlineUrl: null,
    sections: SEND28_SECTIONS,
    dates: [
      {
        key: 'decisionLetter',
        label:
          'Section 3 Date the Local Authority sent the letter giving their decision',
        find: 'the date on the local authority’s decision letter that is being appealed',
      },
      {
        key: 'mediationCertificate',
        label: 'Date on the mediation certificate',
        find: 'the date on the mediation certificate',
      },
    ],
    datesSection: 'decision',
    timing: {
      rule: 'appeal',
      lateQuestion: 'A separate written statement (the form has no box for it)',
    },
    checklist: [
      'Section 3: the parent chooses Yes/No to the appeal being determined on the written evidence without an oral hearing, to an earlier hearing date, and to the local authority obtaining the child’s views to submit with their response; and whether existing appeals and claims should be heard at the same time.',
      'Section 7 checklist — enclose: the signed and dated Local Authority decision letter; a copy of the signed mediation certificate, or confirmation that the appeal is about the school/institution or type of school/institution only; the reasons for the appeal (Section 2); a copy of the child’s EHC plan and all documents listed in Part K (where a plan has been issued).',
      'Section 8: signed and dated by the 1st (and 2nd) parent, or by a qualified lawyer as representative with permission, ticking who they represent; if sent by email, type names in the signature boxes.',
      'Send to HMCTS, SEND Tribunal, 1st Floor, Darlington Magistrates Court, Parkgate, Darlington DL1 1RU, or email send@justice.gov.uk; keep a copy. If late, attach the written reasons for delay or the papers are returned unregistered.',
      'The Diversity Monitoring Questionnaire is optional and for the parent to complete.',
      'If the child is not detained in youth accommodation, use SEND35 (or SEND35A for a refusal to assess) instead.',
    ],
    ageLimit: true,
  },
  send28a_appeal: {
    code: 'SEND28A',
    group: 'appeal',
    version: 'Version 04.23',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send28a-appeal-form-young-person-under-18-detained-in-youth-accommodation',
    onlineUrl: null,
    sections: SEND28A_SECTIONS,
    dates: [
      {
        key: 'decisionLetter',
        label:
          'Section 3 Date the Local Authority sent the letter giving their decision',
        find: 'the date on the local authority’s decision letter that is being appealed',
      },
      {
        key: 'mediationCertificate',
        label: 'Date on the mediation certificate',
        find: 'the date on the mediation certificate',
      },
    ],
    datesSection: 'decision',
    timing: {
      rule: 'appeal',
      lateQuestion: 'A separate written statement (the form has no box for it)',
    },
    checklist: [
      'Section 3: the young person chooses Yes/No to the appeal being determined on the written evidence without an oral hearing, and to an earlier hearing date; and whether existing appeals and claims should be heard at the same time.',
      'Section 7 checklist — enclose: the signed and dated Local Authority decision letter; a copy of the signed mediation certificate, or confirmation that the appeal is about the school/institution or type of school/institution only; the reasons for the appeal (Section 2); a copy of the young person’s EHC plan and all documents listed in Part K (where a plan has been issued).',
      'Section 8: signed and dated by the young person, or by a qualified lawyer as representative with permission; if sent by email, type the name in the signature box.',
      'Send to HMCTS, SEND Tribunal, 1st Floor, Darlington Magistrates Court, Parkgate, Darlington DL1 1RU, or email send@justice.gov.uk; keep a copy. If late, attach the written reasons for delay or the papers are returned unregistered.',
      'The Diversity Monitoring Questionnaire is optional and for the young person to complete.',
      'If the young person is a child of or under statutory school age, SEND28 (appeal by the parent) is used instead; if not detained, SEND35/SEND35A.',
    ],
    ageLimit: true,
  },
  send4a_claim: {
    code: 'SEND4A',
    group: 'claim',
    version: 'Version 10.20',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send4a-disability-discrimination-claim-by-a-parent',
    onlineUrl: null,
    sections: SEND4A_SECTIONS,
    dates: [
      {
        key: 'discriminationDate',
        label: 'Section 4: Date/most recent date of discrimination',
        find: 'the date of the act of discrimination, or the date the school decided not to do something, or, for a series of connected acts, the date of the most recent one',
      },
    ],
    datesSection: 'claim',
    timing: {
      rule: 'limit',
      from: 'discriminationDate',
      add: { months: 6 },
      lateQuestion: 'Section 7 (Late claims)',
      describe:
        'six months starting with the date of the discrimination (or the most recent of a series of connected acts)',
      startingWith: true,
    },
    checklist: [
      'Confirm both eligibility boxes can be ticked: not asking the Tribunal to order reinstatement after a permanent exclusion (otherwise use SEND26A), and the claimant has parental responsibility for the child or lives with the child, and the child has not reached school leaving age (otherwise the young person claims on SEND4B).',
      'Section 1: tick the child’s gender (Boy/Girl).',
      'Section 2: choose who should receive information about the claim (1st claimant or representative); give any reason the other person with parental responsibility should not be sent details.',
      'Section 4: the date/most recent date of discrimination must be given or the claim will not be registered.',
      'Section 9: enclose copies (single-sided photocopies, not originals) of the school’s decision documents, disability evidence (diagnosis, statement of SEN/EHC plan), correspondence with the school, other educational documents and any other documents listed.',
      'Section 12: signed and dated by the 1st claimant, and by the 2nd claimant if a joint claim, or by a qualified lawyer with permission (a non-lawyer representative cannot sign); a typed name is accepted if emailed.',
      'Section 13: keep a copy and send the form and documents to HMCTS SEND, 1st Floor, Darlington Magistrates’ Court, Parkgate, DL1 1RU, or by email to send@justice.gov.uk, within six months of the discrimination.',
    ],
    ageLimit: true,
  },
  send4b_claim: {
    code: 'SEND4B',
    group: 'claim',
    version: 'Version 12.20',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send4b-disability-discrimination-claim-by-young-person',
    onlineUrl: null,
    sections: SEND4B_SECTIONS,
    dates: [
      {
        key: 'discriminationDate',
        label: 'Section 3: Date/most recent date of discrimination',
        find: 'the date of the act of discrimination, or the date the school decided not to do something, or, for a series of connected acts, the date of the most recent one',
      },
    ],
    datesSection: 'claim',
    timing: {
      rule: 'limit',
      from: 'discriminationDate',
      add: { months: 6 },
      lateQuestion: 'Section 7 (Late claims)',
      describe:
        'six months starting with the date of the discrimination (or the most recent of a series of connected acts)',
      startingWith: true,
    },
    checklist: [
      'Confirm both eligibility boxes can be ticked: not asking the Tribunal to order reinstatement after a permanent exclusion (otherwise use SEND26B), and the young person is over compulsory school age (the last Friday in June of the academic year they turn 16); otherwise the parent claims on SEND4A.',
      'Section 1: the young person chooses their title and who should receive information about the claim (You or Your Representative).',
      'Section 3: the date/most recent date of discrimination must be given or the claim will not be registered.',
      'Section 9: enclose copies of the school’s decision documents, disability evidence (diagnosis, statement of SEN/EHC plan), correspondence with the school, other educational documents and any other documents listed.',
      'Section 12: the young person ticks the box confirming they filled in the form or agree with what someone else wrote, then signs and dates it, or a qualified lawyer signs with their permission; if someone else is handling the claim and signs, send the young person’s signed authority or proof that they lack capacity to handle the claim.',
      'Section 13: keep a copy and send the form and documents to HMCTS SEND, 1st Floor, Darlington Magistrates’ Court, Parkgate, DL1 1RU, or by email to send@justice.gov.uk, within six months of the discrimination.',
    ],
    ageLimit: true,
  },
  send26a_claim: {
    code: 'SEND26A',
    group: 'claim',
    version: 'Version 04.23',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send26a-disability-discrimination-claim-after-permanent-exclusion-parent',
    onlineUrl: null,
    sections: SEND26A_SECTIONS,
    dates: [
      {
        key: 'exclusionDecision',
        label: 'Date of the head teacher’s permanent exclusion',
        find: 'the date the head teacher (or member of staff) decided to permanently exclude the child, from the exclusion letter',
      },
      {
        key: 'governorsUpheld',
        label: 'Date the governing body upheld the exclusion',
        find: 'the date the governing body upheld the permanent exclusion, from its decision letter',
      },
      {
        key: 'irpDecision',
        label: 'Date the Independent Review Panel sent its decision',
        find: 'the date an Independent Review Panel sent the parent its decision or recommendation, if there was a review',
      },
      {
        key: 'otherDiscriminationDate',
        label: 'Most recent date of any other discrimination claimed',
        find: 'for any other claims in Section 5, the date of the most recent act of discrimination or decision not to do something',
      },
    ],
    datesSection: 'exclusion',
    timing: {
      rule: 'limit',
      from: ['irpDecision', 'governorsUpheld'],
      add: { months: 6 },
      lateQuestion: 'Section 6 (Late claims)',
      describe:
        'six months starting with the date an Independent Review Panel sent its decision, or else the date the governing body upheld the exclusion',
      startingWith: true,
      fallbackNote:
        'No Independent Review Panel decision was found, so this counts from the governors’ decision. If a review panel review is pending, the six months run from its decision instead.',
    },
    checklist: [
      'Any other claim in the other-claims section has its own six-month limit, starting with the date of its most recent act — check each one.',
      'Confirm all three eligibility boxes can be ticked: parental responsibility for the child or living with the child, who has not reached school leaving age; the child has been permanently excluded (for a state school, the governing body has upheld it); and the claimant wants the Tribunal to order reinstatement. If reinstatement is not sought, use SEND4A.',
      'Section 1: tick the child’s gender (Boy/Girl).',
      'Section 3: choose who should receive information about the claim (1st claimant, 2nd claimant or representative); give any reason the other person with parental responsibility should not be sent details.',
      'Section 4: answer Yes/No to whether an Independent Review Panel review has been applied for and whether it has decided; if it has not decided, the claim is put on hold until the claimant tells the Tribunal the outcome.',
      'Section 9: enclose the exclusion letter and the governing body’s decision (or explain why not), disability evidence, correspondence with the school and other documents — all documents to be relied on must be sent with the claim form in a reinstatement claim.',
      'Section 10: name the witnesses (normally only two are allowed in an expedited claim) and the representative now, as there is no later attendance form in an expedited claim.',
      'Section 13: tick the declaration and sign and date — the 1st claimant, and the 2nd claimant if a joint claim, or a qualified lawyer with permission.',
      'Section 14: keep a copy and send the form and documents to HMCTS SEND, 1st Floor, Darlington Magistrates’ Court, Parkgate, DL1 1RU, or by email to send@justice.gov.uk, within six months.',
    ],
    ageLimit: true,
  },
  send26b_claim: {
    code: 'SEND26B',
    group: 'claim',
    version: 'Version 04.23',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send26b-disability-discrimination-claim-after-permanent-exclusion-young-person',
    onlineUrl: null,
    sections: SEND26B_SECTIONS,
    dates: [
      {
        key: 'exclusionDecision',
        label: 'Date of the head teacher’s permanent exclusion',
        find: 'the date the head teacher (or member of staff) decided to permanently exclude the young person, from the exclusion letter',
      },
      {
        key: 'governorsUpheld',
        label: 'Date the governing body upheld the exclusion',
        find: 'the date the governing body upheld the permanent exclusion, from its decision letter',
      },
      {
        key: 'irpDecision',
        label: 'Date the Independent Review Panel sent its decision',
        find: 'the date an Independent Review Panel sent its decision or recommendation, if there was a review',
      },
      {
        key: 'otherDiscriminationDate',
        label: 'Most recent date of any other discrimination claimed',
        find: 'for any other claims in Section 4, the date of the most recent act of discrimination or decision not to do something',
      },
    ],
    datesSection: 'exclusion',
    timing: {
      rule: 'limit',
      from: ['irpDecision', 'governorsUpheld'],
      add: { months: 6 },
      lateQuestion: 'Section 6 (Late claims)',
      describe:
        'six months starting with the date an Independent Review Panel sent its decision, or else the date the governing body upheld the exclusion',
      startingWith: true,
      fallbackNote:
        'No Independent Review Panel decision was found, so this counts from the governors’ decision. If a review panel review is pending, the six months run from its decision instead.',
    },
    checklist: [
      'Any other claim in the other-claims section has its own six-month limit, starting with the date of its most recent act — check each one.',
      'Confirm all three eligibility boxes can be ticked: over compulsory school age (the last Friday in June of the academic year they turn 16); permanently excluded (for a state school, the governing body has upheld it); and wants an order for reinstatement. If reinstatement is not sought, use SEND4B.',
      'Section 1: the young person chooses their title, ticks Male/Female, and chooses who should receive information about the claim (You or Your Representative).',
      'Section 3: answer Yes/No to whether an Independent Review Panel review has been applied for and whether it has decided; if it has not decided, the claim is put on hold until the outcome is known.',
      'Section 8: enclose the exclusion letter and the governing body’s decision, disability evidence, correspondence with the school and other documents — all documents to be relied on must be sent with the claim in a reinstatement claim.',
      'Section 11: the young person ticks the box confirming they filled in the form or agree with what someone else wrote, then signs and dates it, or a qualified lawyer signs with their permission; if someone else is handling the claim and signs, send the young person’s signed authority or proof that they lack capacity.',
      'Section 12: keep a copy and send the form and documents to HMCTS SEND, 1st Floor, Darlington Magistrates’ Court, Parkgate, DL1 1RU, or by email to send@justice.gov.uk, within six months.',
      'There is no witness section on this form: tell the Tribunal of any witnesses (normally two in an expedited claim) and any hearing representative with the claim or as the registration letter directs.',
    ],
    ageLimit: true,
  },
  send8_withdrawal: {
    code: 'SEND8',
    group: 'during',
    version: 'Version 07.18',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send8-withdrawal-of-appeal-or-claim',
    onlineUrl: null,
    sections: SEND8_SECTIONS,
    dates: [],
    datesSection: null,
    timing: null,
    checklist: [
      'The parent or young person has confirmed they want to withdraw; the form states they understand the Tribunal will take no further action on the appeal/claim.',
      'Signed and dated by the same person (or people) who signed the notice of appeal or claim form — if two parents signed the appeal, both sign here.',
      'Check the agreement is in writing (for example an amended EHC plan, or a letter confirming the concession) before withdrawing.',
      'Return the form to the Special Educational Needs and Disability Tribunal, 1st Floor, Darlington Magistrates Court, Parkgate, Darlington DL1 1RU.',
    ],
    details: {
      localAuthority: true,
      responsibleBody: true,
      finalHearing: true,
    },
  },
  send11_attendance: {
    code: 'SEND11',
    group: 'during',
    version: 'Word version',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send11-attendance-form-parents',
    onlineUrl: null,
    sections: SEND11_SECTIONS,
    dates: [
      {
        key: 'attendanceDeadline',
        label: 'Date the attendance form must be returned',
        find: 'the deadline for returning the attendance form (5pm on the date in week 9 of the timetable), from the case directions or registration letter',
      },
    ],
    datesSection: 'details',
    timing: {
      rule: 'limit',
      from: 'attendanceDeadline',
      add: {},
      lateQuestion: null,
      describe:
        'the return date given in the Tribunal’s timetable for this form',
    },
    checklist: [
      'Confirm each witness has agreed to attend and that their name and occupation are right.',
      'For any additional witnesses beyond three, complete request for changes form SEND7.',
      'Signed, dated and the name printed by the parent.',
      'Return by 5pm on the deadline in the case directions (week 9 of the timetable), or witnesses may not be able to attend.',
    ],
  },
  send11yp_attendance: {
    code: 'SEND11YP',
    group: 'during',
    version: 'Version 07.18',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send11yp-attendance-form-young-person',
    onlineUrl: null,
    sections: SEND11YP_SECTIONS,
    dates: [
      {
        key: 'attendanceDeadline',
        label: 'Date the attendance form must be returned',
        find: 'the deadline for returning the attendance form referred to in the registration documents or case directions',
      },
    ],
    datesSection: 'details',
    timing: {
      rule: 'limit',
      from: 'attendanceDeadline',
      add: {},
      lateQuestion: null,
      describe:
        'the deadline given on the registration documents for this form',
    },
    checklist: [
      'Confirm each witness has agreed to attend and that their name and occupation are right.',
      'For any additional witnesses beyond three, complete request for changes form SEND7.',
      'Signed and dated by the young person, with their name printed.',
      'Return by the deadline in the registration documents, or witnesses may not be able to attend.',
    ],
  },
  send30_witness_summons: {
    code: 'SEND30',
    group: 'during',
    version: 'Version 07.18',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send30-request-for-a-witness-summons',
    onlineUrl: null,
    sections: SEND30_SECTIONS,
    dates: [],
    datesSection: null,
    timing: null,
    checklist: [
      'Tick the reasons that apply, and attach copies of the relevant letters/emails showing the witness refused to attend.',
      'Enter the date of request when the form is sent.',
      'If the summons is granted, it must be given to the witness at least 14 days before the date of the hearing — leave time for that. The witness may apply to the Tribunal Judge for the summons to be set aside.',
      'A summons must reach the witness at least 14 days before the hearing, so send this request well before then.',
    ],
    details: { finalHearing: true },
  },
  send15a_expenses: {
    code: 'SEND15A',
    group: 'after',
    version: 'Version 07.18',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send15a-expenses-claim-form-parents',
    onlineUrl: null,
    sections: SEND15A_SECTIONS,
    dates: [],
    datesSection: null,
    timing: null,
    checklist: [
      'Section 2 Method of payment: the claimant chooses “By cheque to my home address” or “Direct to my bank”. Bank name, branch address and postcode, account name, account number and sort code are written by the claimant themselves — never drafted or copied from the file.',
      'Section 3: full name of carer (surname and first names) — the parent or carer who attended.',
      'If travelling by own motor vehicle: the miles from home to the hearing and back (paid at 23.8p per mile on this version of the form) and the amount claimed in £ are the claimant’s own figures.',
      'Attach every travel ticket and receipt; any that are missing are explained on form SEND17, returned with this form.',
      'Section 5 Declaration: name, signature and date of the parent claiming.',
      'Complete in CAPITAL LETTERS.',
      'Send the completed form with all receipts and tickets to the Special Educational Needs and Disability Tribunal, 1st Floor, Darlington Magistrates Court, Parkgate, Darlington DL1 1RU.',
    ],
    details: { finalHearing: true },
  },
  send15ayp_expenses: {
    code: 'SEND15AYP',
    group: 'after',
    version: 'Version 07.18',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send15ayp-expenses-claim-form-young-person',
    onlineUrl: null,
    sections: SEND15AYP_SECTIONS,
    dates: [],
    datesSection: null,
    timing: null,
    checklist: [
      'Section 2 Method of payment: the claimant chooses “By cheque to my home address” or “Direct to my bank”. Bank name, branch address and postcode, account name, account number and sort code are written by the claimant themselves — never drafted or copied from the file.',
      'If travelling by own motor vehicle: the miles from home to the hearing and back (paid at 23.8p per mile on this version of the form) and the amount claimed in £ are the claimant’s own figures.',
      'Attach every travel ticket and receipt; explain any missing ones in the box in Section 4.',
      'Section 5 Declaration: name, signature and date of the young person.',
      'Complete in CAPITAL LETTERS.',
      'Send the completed form with all receipts and tickets to the Special Educational Needs and Disability Tribunal, 1st Floor, Darlington Magistrates Court, Parkgate, Darlington DL1 1RU.',
      'Section 1: the young person’s own name, home address, postcode and telephone number, in capital letters.',
    ],
    details: { finalHearing: true },
  },
  send16a_expenses: {
    code: 'SEND16A',
    group: 'after',
    version: 'Version 07.18',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send16a-expenses-claim-form-witnesses',
    onlineUrl: null,
    sections: SEND16A_SECTIONS,
    dates: [],
    datesSection: null,
    timing: null,
    checklist: [
      'Section 2 Method of payment: the claimant chooses “By cheque to my home address” or “Direct to my bank”. Bank name, branch address and postcode, account name, account number and sort code are written by the claimant themselves — never drafted or copied from the file.',
      'If travelling by own motor vehicle: the miles from home to the hearing and back (paid at 23.8p per mile on this version of the form) and the amount claimed in £ are the claimant’s own figures.',
      'Section 5: the witness confirms they lost earnings that were not made good, and chooses up to 4 hours or over 4 hours absence.',
      'Section 6 Total claim: travel expenses, loss of earnings and total amount claimed in £, completed by the witness.',
      'Attach every travel ticket and receipt; any that are missing are explained on form SEND17, returned with this form.',
      'Section 7 Declaration: signature, name and date of the witness.',
      'Complete in CAPITAL LETTERS.',
      'Send the completed form with all receipts and tickets to the Special Educational Needs and Disability Tribunal, 1st Floor, Darlington Magistrates Court, Parkgate, Darlington DL1 1RU.',
    ],
    details: { finalHearing: true },
  },
  send17_missing_receipts: {
    code: 'SEND17',
    group: 'after',
    version: 'Version 07.18',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send17-explanation-for-missing-travel-ticketsreceipts',
    onlineUrl: null,
    sections: SEND17_SECTIONS,
    dates: [],
    datesSection: null,
    timing: null,
    checklist: [
      'Signed, named and dated by the person making the expenses claim.',
      'Submit with the SEND15A or SEND16A claim form it explains — it cannot be sent on its own.',
    ],
  },
  send20a_permission: {
    code: 'SEND20A',
    group: 'after',
    version: 'Version 07.18',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send20a-application-for-permission-to-appeal',
    onlineUrl: null,
    sections: SEND20A_SECTIONS,
    dates: [
      {
        key: 'decisionSent',
        label: 'Date the decision was sent to you by the Tribunal',
        find: 'the date the Tribunal sent its written decision (the date on, or of the covering email or letter with, the decision being challenged)',
      },
    ],
    datesSection: 'details',
    timing: {
      rule: 'limit',
      from: 'decisionSent',
      add: { days: 28 },
      lateQuestion:
        'Section B (“what are the reasons for your delay in sending the application?”)',
      describe:
        '28 days from the date the decision was sent (for permission to appeal, check the decision’s covering letter: the 28 days can run from a later date, such as when written reasons were sent)',
    },
    checklist: [
      'If the appeal or claim was the young person’s own, Section A is about them, not the parent.',
      'Section A: confirm who should receive information about the application (Parent one, Parent two or Representative) — the applicant’s choice.',
      'Section E: the applicant signs and dates the declaration (“I apply for permission to appeal against the decision of the Tribunal identified in paragraph B above”).',
      'Section E: delete the line authorising the representative if there is no representative (or if a legal representative is filling in the form for a client).',
      'Send the signed form with a copy of the decision you are applying for leave to appeal against and any other relevant documentation to HMCTS, SEND Tribunal, 1st Floor, Darlington Magistrates Court, Parkgate, Darlington DL1 1RU (or by fax); obtain proof of posting and keep a copy.',
    ],
    details: {
      localAuthority: true,
      responsibleBody: true,
      finalHearing: true,
    },
  },
  send20b_review: {
    code: 'SEND20B',
    group: 'after',
    version: 'Version 07.18',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send20b-application-for-review',
    onlineUrl: null,
    sections: SEND20B_SECTIONS,
    dates: [
      {
        key: 'decisionSent',
        label: 'Date the decision was sent to you by the Tribunal',
        find: 'the date the Tribunal sent its written decision (the date on, or of the covering email or letter with, the decision being challenged)',
      },
    ],
    datesSection: 'details',
    timing: {
      rule: 'limit',
      from: 'decisionSent',
      add: { days: 28 },
      lateQuestion:
        'Section B (“what are the reasons for your delay in sending the application?”)',
      describe: '28 days from the date the decision was sent',
    },
    checklist: [
      'If the appeal or claim was the young person’s own, Section A is about them, not the parent.',
      'Section A: confirm who should receive information about the application (Parent one, Parent two or Representative) — the applicant’s choice.',
      'Section D: the applicant signs and dates the declaration (“I apply for the Tribunal to review its decision identified in paragraph B above for the reasons given”).',
      'Section D: delete the line authorising the representative if there is no representative (or if a legal representative is filling in the form for a client).',
      'Send the signed form with a copy of the decision you are asking the Tribunal to review and any other relevant documentation to HMCTS, SEND Tribunal, 1st Floor, Darlington Magistrates Court, Parkgate, Darlington DL1 1RU (or by fax); obtain proof of posting and keep a copy.',
    ],
    details: {
      localAuthority: true,
      responsibleBody: true,
      finalHearing: true,
    },
  },
  send20c_set_aside: {
    code: 'SEND20C',
    group: 'after',
    version: 'Version 07.18',
    guidanceUrl:
      'https://www.gov.uk/government/publications/form-send20c-application-to-set-aside-final-decision',
    onlineUrl: null,
    sections: SEND20C_SECTIONS,
    dates: [
      {
        key: 'decisionSent',
        label: 'Date the decision was sent to you by the Tribunal',
        find: 'the date the Tribunal sent its written decision (the date on, or of the covering email or letter with, the decision being challenged)',
      },
    ],
    datesSection: 'details',
    timing: {
      rule: 'limit',
      from: 'decisionSent',
      add: { days: 28 },
      lateQuestion:
        'Section B (“what are the reasons for your delay in sending the application?”)',
      describe: '28 days from the date the decision was sent',
    },
    checklist: [
      'If the appeal or claim was the young person’s own, Section A is about them, not the parent.',
      'Section A: confirm who should receive information about the application (Parent one, Parent two or Representative) — the applicant’s choice.',
      'Section C: the applicant signs and dates the declaration (“I apply for the Tribunal to set aside its decision/ a part of the decision identified in paragraph B above for the reasons given”).',
      'Section C: delete the line authorising the representative if there is no representative (or if a legal representative is filling in the form for a client).',
      'Send the signed form with a copy of the decision you are asking the Tribunal to set aside and any other relevant documentation to HMCTS, SEND Tribunal, 1st Floor, Darlington Magistrates Court, Parkgate, Darlington DL1 1RU (or by fax); obtain proof of posting and keep a copy.',
      'Section C: delete “its decision” or “a part of the decision” as appropriate.',
      'Section B: tick the ground or grounds that apply (the draft proposes which).',
    ],
    details: {
      localAuthority: true,
      responsibleBody: true,
      finalHearing: true,
    },
  },
};

/** The sections of each kind of draft, in order. */
export const DRAFT_KIND_SECTIONS: Record<
  DraftKind,
  readonly { key: string; heading: string; guidance: string }[]
> = {
  position_statement: POSITION_STATEMENT_SECTIONS,
  send35_appeal: SEND35_SECTIONS,
  send35a_appeal: SEND35A_SECTIONS,
  send7_request: SEND7_SECTIONS,
  send45_case_review: SEND45_SECTIONS,
  send28_appeal: SEND28_SECTIONS,
  send28a_appeal: SEND28A_SECTIONS,
  send4a_claim: SEND4A_SECTIONS,
  send4b_claim: SEND4B_SECTIONS,
  send26a_claim: SEND26A_SECTIONS,
  send26b_claim: SEND26B_SECTIONS,
  send8_withdrawal: SEND8_SECTIONS,
  send11_attendance: SEND11_SECTIONS,
  send11yp_attendance: SEND11YP_SECTIONS,
  send30_witness_summons: SEND30_SECTIONS,
  send15a_expenses: SEND15A_SECTIONS,
  send15ayp_expenses: SEND15AYP_SECTIONS,
  send16a_expenses: SEND16A_SECTIONS,
  send17_missing_receipts: SEND17_SECTIONS,
  send20a_permission: SEND20A_SECTIONS,
  send20b_review: SEND20B_SECTIONS,
  send20c_set_aside: SEND20C_SECTIONS,
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

// --- Case list import (migration) -----------------------------------------------
/**
 * How each value in the charity's existing case list spreadsheet is read. A
 * spreadsheet column is matched to one of these fields by its heading (the
 * system's own label, or one of the alternatives); an admin can change any
 * match on screen before importing.
 */
export type CaseImportFieldKind =
  | 'text'
  | 'date'
  | 'email'
  | 'notes'
  /** One value from a vocabulary. */
  | 'vocab'
  /** A member of staff (matched to the users table) or an owner queue. */
  | 'owner'
  /** A member of staff. */
  | 'user'
  /** One or more teams, e.g. "TSA" or "TSA / ISA". */
  | 'teams';

export interface CaseImportFieldDef {
  id: string;
  /** The system's own heading for the field. */
  label: string;
  /** Other headings that mean the same field. */
  aliases: readonly string[];
  kind: CaseImportFieldKind;
  values?: readonly string[];
  /** Shown in the simple preview (the rest in the advanced view). */
  simple?: boolean;
}

export const CASE_IMPORT_FIELDS = [
  {
    id: 'dateOfEnquiry',
    label: 'Date of enquiry',
    aliases: ['Enquiry date', 'Date'],
    kind: 'date',
    simple: true,
  },
  {
    id: 'allocatedTo',
    label: 'Allocated to',
    aliases: ['Owner', 'Caseworker', 'Staff'],
    kind: 'owner',
    simple: true,
  },
  {
    id: 'dealingShadow',
    label: 'Dealing/ Shadow',
    aliases: ['Dealing/Shadow', 'Dealing', 'Shadow'],
    kind: 'user',
  },
  {
    id: 'team',
    label: 'Current Team',
    aliases: ['Team'],
    kind: 'teams',
  },
  {
    id: 'status',
    label: 'Status',
    aliases: ['Case status'],
    kind: 'vocab',
    values: STATUS_VALUES,
    simple: true,
  },
  {
    id: 'clientName',
    label: 'Client Name',
    aliases: ['Client', 'Parent', 'Parent name'],
    kind: 'text',
    simple: true,
  },
  {
    id: 'email',
    label: 'Email',
    aliases: ['Email address', 'Client email'],
    kind: 'email',
  },
  {
    id: 'childName',
    label: "Child's Name",
    aliases: ['Child', 'Child name', 'Young person'],
    kind: 'text',
    simple: true,
  },
  {
    id: 'childDateOfBirth',
    label: "Child's date of birth",
    aliases: ['Date of birth', 'DOB', 'Child DOB'],
    kind: 'date',
  },
  {
    id: 'originalQuery',
    label: 'Original Query',
    aliases: ['Query', 'Query type'],
    kind: 'vocab',
    values: QUERY_TYPE_VALUES,
  },
  {
    id: 'methodOfEnquiry',
    label: 'Method of enquiry',
    aliases: ['Enquiry method', 'Method'],
    kind: 'vocab',
    values: ENQUIRY_METHOD_VALUES,
  },
  {
    id: 'currentWork',
    label: 'Current Work',
    aliases: ['Type of case', 'Work type', 'Work'],
    kind: 'vocab',
    values: WORK_TYPE_VALUES,
    simple: true,
  },
  {
    id: 'appealNumber',
    label: 'Appeal number',
    aliases: ['Tribunal reference', 'Appeal ref'],
    kind: 'text',
  },
  {
    id: 'notes',
    label: 'Notes',
    aliases: ['Case notes', 'Comments'],
    kind: 'notes',
  },
  {
    id: 'paymentCode',
    label: 'Payment Details',
    aliases: ['Payment code', 'Payment'],
    kind: 'vocab',
    values: PAYMENT_CODE_VALUES,
  },
  {
    id: 'discountCode',
    label: 'Discount Code',
    aliases: ['Discount'],
    kind: 'vocab',
    values: DISCOUNT_CODE_VALUES,
  },
  {
    id: 'invoiceStatus',
    label: 'Invoice Status',
    aliases: ['Invoice'],
    kind: 'text',
  },
  {
    id: 'phone',
    label: 'Phone Number',
    aliases: ['Phone', 'Telephone', 'Landline'],
    kind: 'text',
  },
  {
    id: 'mobile',
    label: 'Mobile Number',
    aliases: ['Mobile'],
    kind: 'text',
  },
  {
    id: 'otherContact',
    label: 'Other',
    aliases: ['Other contact'],
    kind: 'text',
  },
  {
    id: 'streetAddress',
    label: 'Street Address',
    aliases: ['Address', 'Address line 1'],
    kind: 'text',
  },
  {
    id: 'city',
    label: 'City',
    aliases: ['Town', 'Town or city'],
    kind: 'text',
  },
  { id: 'county', label: 'County', aliases: [], kind: 'text' },
  { id: 'postcode', label: 'Postcode', aliases: ['Post code'], kind: 'text' },
  {
    id: 'accountingNotes',
    label: 'QB Notes',
    aliases: ['QuickBooks notes', 'Accounting notes'],
    kind: 'text',
  },
] as const satisfies readonly CaseImportFieldDef[];
export type CaseImportFieldId = (typeof CASE_IMPORT_FIELDS)[number]['id'];
export const CASE_IMPORT_FIELD_IDS = CASE_IMPORT_FIELDS.map(
  (f) => f.id,
) as unknown as readonly [CaseImportFieldId, ...CaseImportFieldId[]];

/** The most rows one import takes (split a larger list into several files). */
export const CASE_IMPORT_MAX_ROWS = 10_000;
/** Status given to a row whose Status cell is empty. */
export const CASE_IMPORT_DEFAULT_STATUS: Status = 'Enquiry';
/** Owner queue for a row with no recognisable "Allocated to". */
export const CASE_IMPORT_DEFAULT_QUEUE: OwnerQueue = 'Enquiries';
/** First line of the case note made from a row's Notes column. */
export const CASE_IMPORT_NOTE_HEADING = 'From the case list (imported):';

// --- Search inside documents and emails ----------------------------------------
/**
 * How much of each document's (and email's) text is indexed for search: the
 * first this many characters (roughly 100 pages). Postgres refuses to index a
 * text whose search vector would pass 1 MB, so very long texts are indexed up
 * to this point only — tested to stay well under the limit for any text.
 */
export const SEARCH_INDEXED_CHARS = 300_000;
/** The most results one search returns (the total is still reported). */
export const SEARCH_MAX_RESULTS = 50;
/** The longest search a person can type. */
export const SEARCH_QUERY_MAX = 200;
/** What a search looks in. */
export const SEARCH_SCOPE_VALUES = ['all', 'documents', 'emails'] as const;
export type SearchScope = (typeof SEARCH_SCOPE_VALUES)[number];
export const SEARCH_SCOPE_LABELS: Record<SearchScope, string> = {
  all: 'Documents and emails',
  documents: 'Documents',
  emails: 'Emails',
};
