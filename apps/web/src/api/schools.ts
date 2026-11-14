import type {
  CaseSchool,
  CaseSchoolRole,
  SchoolContact,
  SchoolDetail,
  SchoolFields,
  SchoolFunding,
  SchoolProvision,
  SchoolSummary,
} from '@re-send/shared';
import { ApiError, request } from './client';

export interface SchoolSearch {
  q?: string;
  section41?: boolean;
  funding?: SchoolFunding[];
  provision?: SchoolProvision[];
  archived?: boolean;
}

export function searchSchools(
  s: SchoolSearch,
): Promise<{ schools: SchoolSummary[] }> {
  const q = new URLSearchParams();
  if (s.q?.trim()) q.set('q', s.q.trim());
  if (s.section41) q.set('section41', 'true');
  if (s.funding?.length) q.set('funding', s.funding.join(','));
  if (s.provision?.length) q.set('provision', s.provision.join(','));
  if (s.archived) q.set('archived', 'true');
  return request(`/api/schools?${q.toString()}`);
}

export function fetchSchool(id: string): Promise<SchoolDetail> {
  return request(`/api/schools/${id}`);
}

export type CreateSchoolResult =
  { school: SchoolDetail } | { duplicates: SchoolSummary[] };

/**
 * Add a school. A likely duplicate comes back as `{ duplicates }` (not an
 * error) so the form can offer the existing school instead; `force` adds it
 * anyway.
 */
export async function createSchool(
  fields: Partial<SchoolFields> & { name: string },
  force = false,
): Promise<CreateSchoolResult> {
  try {
    const school = await request<SchoolDetail>(
      `/api/schools${force ? '?force=true' : ''}`,
      { method: 'POST', body: JSON.stringify(fields) },
    );
    return { school };
  } catch (err) {
    const dupes = (err as ApiError).body as
      { duplicates?: SchoolSummary[] } | undefined;
    // A 409 with matches is a duplicate warning; one without (a URN already
    // taken) is an error the form shows as it is.
    if (
      err instanceof ApiError &&
      err.status === 409 &&
      dupes?.duplicates?.length
    )
      return { duplicates: dupes.duplicates };
    throw err;
  }
}

export function updateSchool(
  id: string,
  patch: Partial<SchoolFields>,
): Promise<SchoolDetail> {
  return request(`/api/schools/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function archiveSchool(
  id: string,
  archived: boolean,
): Promise<SchoolDetail> {
  return request(`/api/schools/${id}/archive`, {
    method: 'POST',
    body: JSON.stringify({ archived }),
  });
}

export type ContactInput = Omit<SchoolContact, 'id' | 'schoolId'>;

export function addContact(
  schoolId: string,
  contact: ContactInput,
): Promise<SchoolContact> {
  return request(`/api/schools/${schoolId}/contacts`, {
    method: 'POST',
    body: JSON.stringify(contact),
  });
}

export function updateContact(
  id: string,
  patch: Partial<ContactInput>,
): Promise<SchoolContact> {
  return request(`/api/school-contacts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function removeContact(id: string): Promise<{ deleted: true }> {
  return request(`/api/school-contacts/${id}`, { method: 'DELETE' });
}

type CaseSchools = { schools: CaseSchool[] };

export function fetchCaseSchools(caseId: string): Promise<CaseSchools> {
  return request(`/api/cases/${caseId}/schools`);
}

export function linkSchool(
  caseId: string,
  schoolId: string,
  role: CaseSchoolRole,
): Promise<CaseSchools> {
  return request(`/api/cases/${caseId}/schools`, {
    method: 'POST',
    body: JSON.stringify({ schoolId, role }),
  });
}

export function updateCaseSchool(
  caseId: string,
  linkId: string,
  patch: { role?: CaseSchoolRole; contactIds?: string[] },
): Promise<CaseSchools> {
  return request(`/api/cases/${caseId}/schools/${linkId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function unlinkSchool(
  caseId: string,
  linkId: string,
): Promise<CaseSchools> {
  return request(`/api/cases/${caseId}/schools/${linkId}`, {
    method: 'DELETE',
  });
}
