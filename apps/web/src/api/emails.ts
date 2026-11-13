import type { EmailFileResult, EmailInfo } from '@re-send/shared';
import { request } from './client';
import { postFileWithProgress } from './documents';

/** File one .eml/.msg against a case; attachments are filed as documents. */
export function fileEmail(
  caseId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<EmailFileResult> {
  return postFileWithProgress<EmailFileResult>(
    `/api/cases/${caseId}/emails`,
    file,
    onProgress,
  );
}

export function fetchEmails(caseId: string): Promise<{ emails: EmailInfo[] }> {
  return request(`/api/cases/${caseId}/emails`);
}

export function deleteEmail(
  caseId: string,
  emailId: string,
  withAttachments = false,
): Promise<{ deleted: boolean; attachmentsDeleted: number }> {
  return request(
    `/api/cases/${caseId}/emails/${emailId}${withAttachments ? '?attachments=true' : ''}`,
    { method: 'DELETE' },
  );
}
