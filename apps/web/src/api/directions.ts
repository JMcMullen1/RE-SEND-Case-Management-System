import type {
  DirectionApplyRow,
  DirectionsApplyResult,
  DirectionsResponse,
} from '@re-send/shared';
import { getActingUserId, request } from './client';

/** Upload a directions order (PDF/DOCX) and get the reviewable diff. */
export async function extractDirections(
  caseId: string,
  file: File,
): Promise<DirectionsResponse> {
  const form = new FormData();
  form.append('file', file);
  const headers = new Headers();
  const acting = getActingUserId();
  if (acting) headers.set('x-user-id', acting);
  const res = await fetch(`/api/cases/${caseId}/directions/extract`, {
    method: 'POST',
    body: form,
    headers,
  });
  if (!res.ok)
    return { status: 'error', message: `Upload failed (${res.status})` };
  return (await res.json()) as DirectionsResponse;
}

/** Apply the reviewed diff — the only call that touches the calendar. */
export function applyDirections(
  caseId: string,
  documentId: string | null,
  rows: (DirectionApplyRow & { confidence?: number })[],
): Promise<DirectionsApplyResult> {
  return request(`/api/cases/${caseId}/directions/apply`, {
    method: 'POST',
    body: JSON.stringify({ documentId, rows }),
  });
}
