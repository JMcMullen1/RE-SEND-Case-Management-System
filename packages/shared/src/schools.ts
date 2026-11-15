/**
 * schools.ts — the schools directory: the shapes the API returns, and the pure
 * rules behind it (who may edit, how a likely duplicate is recognised, how a
 * school is summarised in one line). Shared by the API and the web app.
 */

import {
  SCHOOL_AGE_MAX,
  SCHOOL_DIRECTORY_EDIT_ROLES,
  SCHOOL_FUNDING_LABELS,
  SCHOOL_PROVISION_LABELS,
  type CaseSchoolRole,
  type SchoolFunding,
  type SchoolProvision,
} from './config';

export interface SchoolContact {
  id: string;
  schoolId: string;
  name: string;
  /** Job title, e.g. SENCo. */
  role: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

/** The editable facts about a school. */
export interface SchoolFields {
  name: string;
  /** DfE Unique Reference Number (6 digits), when known. */
  urn: string | null;
  address: string | null;
  postcode: string | null;
  localAuthority: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  funding: SchoolFunding | null;
  provision: SchoolProvision | null;
  /** On the Section 41 list (independent special schools approved by the DfE). */
  section41: boolean;
  ageFrom: number | null;
  ageTo: number | null;
  notes: string | null;
}

/** A row in the directory list. */
export interface SchoolSummary extends SchoolFields {
  id: string;
  archived: boolean;
  contactCount: number;
  /** Live cases this school is linked to. */
  caseCount: number;
}

/** A case a school is linked to, as the school page lists it. */
export interface SchoolCaseLink {
  caseId: string;
  caseReference: string;
  childName: string | null;
  role: CaseSchoolRole;
}

export interface SchoolDetail extends SchoolSummary {
  contacts: SchoolContact[];
  cases: SchoolCaseLink[];
}

/** A school linked to a case, as the case screen shows it. */
export interface CaseSchool {
  linkId: string;
  role: CaseSchoolRole;
  school: SchoolSummary;
  /** All of the school's contacts. */
  contacts: SchoolContact[];
  /** The contacts involved in this case. */
  involvedContactIds: string[];
}

/** Whether a role may add and edit schools and their contacts. */
export function canEditSchools(role: string | undefined): boolean {
  return (SCHOOL_DIRECTORY_EDIT_ROLES as readonly string[]).includes(
    role ?? '',
  );
}

/** A DfE URN is six digits (older ones may be shorter); null if empty. */
export function normaliseUrn(raw: string | null | undefined): string | null {
  const s = (raw ?? '').replace(/\s+/g, '');
  return s ? s : null;
}

export function isValidUrn(urn: string): boolean {
  return /^\d{5,7}$/.test(urn);
}

/** Upper-case, single-spaced postcode ("al1 2ab" → "AL1 2AB"); null if empty. */
export function normalisePostcode(
  raw: string | null | undefined,
): string | null {
  const s = (raw ?? '').toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  return s.length > 3 ? `${s.slice(0, -3)} ${s.slice(-3)}` : s;
}

/**
 * A name reduced for comparison: lower-case, punctuation and the words that
 * vary between how people write a school's name removed. "St. Mary's C of E
 * Primary School" and "St Marys CE Primary" compare equal.
 */
export function schoolNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|school|academy|c of e|cofe|ce|church of england)\b/g, ' ')
    .replace(/\bsaint\b/g, 'st')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Ages 4–11", "Ages 11+", or null. */
export function ageRangeLabel(
  from: number | null,
  to: number | null,
): string | null {
  if (from === null && to === null) return null;
  if (from !== null && to !== null) return `Ages ${from}–${to}`;
  if (from !== null) return `Ages ${from}+`;
  return `Ages up to ${to}`;
}

/** One line of key facts: "Academy · Specialist · Section 41 · Ages 11–19". */
export function schoolFactsLine(
  school: Pick<
    SchoolFields,
    'funding' | 'provision' | 'section41' | 'ageFrom' | 'ageTo'
  >,
): string {
  return [
    school.funding ? SCHOOL_FUNDING_LABELS[school.funding] : null,
    school.provision ? SCHOOL_PROVISION_LABELS[school.provision] : null,
    school.section41 ? 'Section 41' : null,
    ageRangeLabel(school.ageFrom, school.ageTo),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Why a set of school fields cannot be saved, or null. */
export function schoolFieldsProblem(f: Partial<SchoolFields>): string | null {
  if (f.name !== undefined && !f.name.trim()) return 'A school needs a name.';
  if (f.urn && !isValidUrn(f.urn)) return 'A URN is 5 to 7 digits.';
  const from = f.ageFrom ?? null;
  const to = f.ageTo ?? null;
  if (from !== null && (from < 0 || from > SCHOOL_AGE_MAX))
    return 'Enter a sensible age.';
  if (to !== null && (to < 0 || to > SCHOOL_AGE_MAX))
    return 'Enter a sensible age.';
  if (from !== null && to !== null && from > to)
    return 'The lower age is above the upper age.';
  return null;
}
