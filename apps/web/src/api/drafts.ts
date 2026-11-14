import type { Draft, DraftKind } from '@re-send/shared';
import { request } from './client';

export function fetchDrafts(caseId: string): Promise<{ drafts: Draft[] }> {
  return request(`/api/cases/${caseId}/drafts`);
}

export function requestDraft(
  caseId: string,
  kind: DraftKind,
  instructions: string | null,
): Promise<Draft> {
  return request(`/api/cases/${caseId}/drafts`, {
    method: 'POST',
    body: JSON.stringify({ kind, instructions }),
  });
}

export function saveDraft(
  id: string,
  baseUpdatedAt: string,
  sections: { key: string; paragraphs: { id?: string; text: string }[] }[],
): Promise<Draft> {
  return request(`/api/drafts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ baseUpdatedAt, sections }),
  });
}

export function approveDraft(id: string): Promise<Draft> {
  return request(`/api/drafts/${id}/approve`, { method: 'POST' });
}

export function discardDraft(id: string): Promise<{ deleted: true }> {
  return request(`/api/drafts/${id}`, { method: 'DELETE' });
}
