import { request } from './client';

export function recordReview(
  caseId: string,
  note?: string,
): Promise<{ reviewedAt: string }> {
  return request(`/api/cases/${caseId}/review`, {
    method: 'POST',
    body: JSON.stringify(note ? { note } : {}),
  });
}
