import type { EmailInboxItem, EmailIntakeResult } from '@re-send/shared';
import { request } from './client';
import { postFileWithProgress } from './documents';

/** Drop in one .eml/.msg to be matched to its case (or listed to choose). */
export function intakeEmail(file: File): Promise<EmailIntakeResult> {
  return postFileWithProgress<EmailIntakeResult>('/api/email-inbox', file);
}

export function fetchInbox(): Promise<{
  items: EmailInboxItem[];
  count: number;
}> {
  return request('/api/email-inbox');
}

export function fetchInboxCount(): Promise<{ count: number }> {
  return request('/api/email-inbox/count');
}

export function fetchInboxText(id: string): Promise<{
  bodyText: string;
  toAddresses: string[];
  ccAddresses: string[];
  attachmentNames: string[];
}> {
  return request(`/api/email-inbox/${id}/text`);
}

export function fileInboxItem(
  id: string,
  caseId: string,
): Promise<EmailIntakeResult> {
  return request(`/api/email-inbox/${id}/file`, {
    method: 'POST',
    body: JSON.stringify({ caseId }),
  });
}

export function dismissInboxItem(id: string): Promise<{ dismissed: true }> {
  return request(`/api/email-inbox/${id}/dismiss`, { method: 'POST' });
}
