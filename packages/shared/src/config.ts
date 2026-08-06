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

// --- DSPL areas -------------------------------------------------------------
export const DSPL_AREA_VALUES = [
  'DSPL1',
  'DSPL2',
  'DSPL3',
  'DSPL4',
  'DSPL5',
  'DSPL6',
  'DSPL7',
  'DSPL8',
  'DSPL9',
] as const;
export type DsplArea = (typeof DSPL_AREA_VALUES)[number];
export const DsplAreaSchema = z.enum(DSPL_AREA_VALUES);

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

// --- Document categories ----------------------------------------------------
export const DOCUMENT_CATEGORY_VALUES = [
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
export type DocumentCategory = (typeof DOCUMENT_CATEGORY_VALUES)[number];
export const DocumentCategorySchema = z.enum(DOCUMENT_CATEGORY_VALUES);

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

// --- Postcode → DSPL area suggestion ----------------------------------------
/**
 * A configurable starting mapping from postcode area (the leading letters) to a
 * DSPL area, for suggesting a value on the case form. RE-SEND operates across
 * Hertfordshire and its borders; this is a first-pass mapping to be corrected
 * by the charity, and the suggestion it produces is always overridable.
 */
export const POSTCODE_DSPL_MAP: Record<string, DsplArea> = {
  AL: 'DSPL1',
  HP: 'DSPL2',
  SG: 'DSPL3',
  WD: 'DSPL4',
  EN: 'DSPL5',
  HA: 'DSPL6',
  LU: 'DSPL7',
  CM: 'DSPL8',
  NW: 'DSPL9',
};

/** Suggest a DSPL area from a postcode's area letters, or null if unmapped. */
export function suggestDsplArea(
  postcode: string | null | undefined,
): DsplArea | null {
  if (!postcode) return null;
  const area = postcode
    .trim()
    .toUpperCase()
    .match(/^[A-Z]+/);
  if (!area) return null;
  return POSTCODE_DSPL_MAP[area[0]] ?? null;
}

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
  'dsplArea',
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
  { id: 'dsplArea', label: 'DSPL area' },
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
    id: 'dsplArea',
    label: 'DSPL area',
    source: { kind: 'vocab', values: DSPL_AREA_VALUES },
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
