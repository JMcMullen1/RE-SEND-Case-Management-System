import type {
  CaseDetail,
  DocumentInfo,
  KeyDateFull,
  Team,
  TimelineItem,
} from '@re-send/shared';
import { request } from './client';

export function fetchCaseDetail(id: string): Promise<CaseDetail> {
  return request<CaseDetail>(`/api/cases/${id}/detail`);
}

export function patchCaseFields(
  id: string,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  return request(`/api/cases/${id}/fields`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function patchClient(
  id: string,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  return request(`/api/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function patchChild(
  id: string,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  return request(`/api/children/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function setCaseTeams(
  id: string,
  team: Team[],
): Promise<{ ok: boolean }> {
  return request(`/api/cases/${id}/teams`, {
    method: 'PUT',
    body: JSON.stringify({ team }),
  });
}

export function createKeyDate(
  caseId: string,
  input: Record<string, unknown>,
): Promise<{ keyDate: KeyDateFull }> {
  return request(`/api/cases/${caseId}/key-dates`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function patchKeyDate(
  id: string,
  patch: Record<string, unknown>,
): Promise<{ keyDate: KeyDateFull }> {
  return request(`/api/key-dates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteKeyDate(id: string): Promise<{ ok: true }> {
  return request(`/api/key-dates/${id}`, { method: 'DELETE' });
}

export function fetchTimeline(
  caseId: string,
  filters: { author?: string; from?: string; to?: string; q?: string },
): Promise<{ items: TimelineItem[] }> {
  const params = new URLSearchParams();
  if (filters.author) params.set('author', filters.author);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  return request(`/api/cases/${caseId}/timeline${qs ? `?${qs}` : ''}`);
}

export function addNote(
  caseId: string,
  body: string,
): Promise<{ item: TimelineItem }> {
  return request(`/api/cases/${caseId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export function editNote(
  noteId: string,
  body: string,
): Promise<{ item: TimelineItem }> {
  return request(`/api/notes/${noteId}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
}

export function fetchDocuments(
  caseId: string,
): Promise<{ documents: DocumentInfo[] }> {
  return request(`/api/cases/${caseId}/documents`);
}
