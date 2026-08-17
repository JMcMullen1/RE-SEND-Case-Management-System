/**
 * case-detail.ts — DTOs and pure logic for the case screen.
 */

import { calendarDaysBetween } from './case-list';
import type {
  ConsultationState,
  DocumentCategory,
  EnquiryMethod,
  KeyDateSource,
  KeyDateType,
  OwnerQueue,
  QueryType,
  SchoolYear,
  Status,
  Team,
  WorkType,
} from './config';

export interface KeyDateFull {
  id: string;
  date: string;
  time: string | null;
  title: string;
  description: string | null;
  type: KeyDateType;
  source: KeyDateSource;
  confidence: string | null;
  sourceReference: string | null;
}

export interface CaseClientDetail {
  id: string;
  fullName: string;
  displayName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  otherContact: string | null;
  streetAddress: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  additionalNeeds: string | null;
  consentDataProcessing: boolean;
  consentInformationSharing: boolean;
  consentContact: boolean;
  consentPrivacyNotice: boolean;
  paymentPlanRequired: boolean;
}

export interface CaseChildDetail {
  id: string;
  fullName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  schoolYear: SchoolYear | null;
  currentSchoolName: string | null;
  currentSchoolAddress: string | null;
  desiredSchool: string | null;
  sendNeeds: string | null;
  /** The local authority for this child's EHCP. */
  la: string | null;
  /** Named LA contacts — free-text lines, one per contact. */
  laContacts: string[];
}

export interface CaseOwnerDetail {
  kind: 'user' | 'queue';
  userId: string | null;
  displayName: string | null;
  queue: OwnerQueue | null;
}

/**
 * Another case belonging to the same client (parent). Each child is a separate
 * case — billing is per child — so a family with several children has several
 * cases; this lets the case screen offer a switcher between the siblings.
 */
export interface FamilyCaseRef {
  caseId: string;
  childName: string;
}

export interface CaseDetail {
  id: string;
  caseReference: string;
  appealNumber: string | null;
  status: Status;
  owner: CaseOwnerDetail;
  shadowUserId: string | null;
  shadowUserName: string | null;
  team: Team[];
  dateOfEnquiry: string | null;
  methodOfEnquiry: EnquiryMethod | null;
  originalQuery: QueryType | null;
  currentWork: WorkType | null;
  consultStatus: ConsultationState;
  supportLevel: string | null;
  aims: string | null;
  client: CaseClientDetail | null;
  child: CaseChildDetail | null;
  keyDates: KeyDateFull[];
  /**
   * Every case for this case's client (this one included), ordered by child
   * name — for the sibling switcher. A single-child family has one entry.
   */
  familyCases: FamilyCaseRef[];
}

export interface DocumentInfo {
  id: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  category: DocumentCategory;
  uploadedByName: string | null;
  uploadedAt: string;
  /** Version number of this document within its filename group (1-based). */
  version: number;
  /** Total live versions filed under this document's group, including this one. */
  versionCount: number;
}

/** One row of a document's version history, newest first. */
export interface DocumentVersionInfo {
  id: string;
  version: number;
  byteSize: number;
  uploadedByName: string | null;
  uploadedAt: string;
  /** True for the version currently in force (not superseded). */
  isCurrent: boolean;
}

/** The outcome of filing a document: brand new, a new version, or a duplicate. */
export type DocumentUploadOutcome = 'created' | 'version' | 'duplicate';

// --- Pure helpers -----------------------------------------------------------

/** Whole years from a date of birth to `today` (both YYYY-MM-DD). */
export function calculateAge(
  dobISO: string | null,
  today: string,
): number | null {
  if (!dobISO) return null;
  const [dy, dm, dd] = dobISO.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  if (!dy || !dm || !dd || !ty || !tm || !td) return null;
  let age = ty - dy;
  if (tm < dm || (tm === dm && td < dd)) age -= 1;
  return age < 0 ? null : age;
}

/** Human file size, e.g. "48 KB", "1.2 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** True when a mime type can be previewed inline in the browser. */
export function isPreviewable(mimeType: string): boolean {
  return mimeType === 'application/pdf' || mimeType.startsWith('image/');
}

export { calendarDaysBetween };
