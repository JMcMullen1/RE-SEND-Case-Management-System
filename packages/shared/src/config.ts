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

// Keep the vocab helper referenced for future single-line vocabularies.
export { vocab };
