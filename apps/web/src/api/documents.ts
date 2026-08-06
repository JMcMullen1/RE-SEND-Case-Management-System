import type {
  DocumentUploadOutcome,
  DocumentVersionInfo,
} from '@re-send/shared';
import { getActingUserId, request } from './client';

export interface UploadResult {
  document: { id: string; originalFilename: string; version: number };
  outcome: DocumentUploadOutcome;
}

/**
 * Upload one document, reporting progress. Uses XMLHttpRequest because fetch
 * cannot report upload progress; the request is multipart to the API.
 *
 * PRESIGNED-UPLOAD SWAP POINT (client): to upload directly to storage, this one
 * function changes — ask the API for a presigned PUT URL, PUT the file straight
 * to `url` (still with progress from xhr.upload), then POST a confirmation. No
 * caller of uploadDocument needs to change; the swap stays inside here and the
 * storage provider.
 */
export function uploadDocument(
  caseId: string,
  file: File,
  category: string,
  onProgress?: (fraction: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open(
      'POST',
      `/api/cases/${caseId}/documents?category=${encodeURIComponent(category)}`,
    );
    const acting = getActingUserId();
    if (acting) xhr.setRequestHeader('x-user-id', acting);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResult);
        } catch {
          reject(new Error('Malformed upload response'));
        }
      } else {
        let message = `Upload failed (${xhr.status})`;
        try {
          const body = JSON.parse(xhr.responseText) as { message?: string };
          if (body.message) message = body.message;
        } catch {
          /* non-JSON error */
        }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(form);
  });
}

export function fetchDocumentVersions(
  documentId: string,
): Promise<{ versions: DocumentVersionInfo[] }> {
  return request(`/api/documents/${documentId}/versions`);
}

export function documentContentUrl(id: string, download = false): string {
  return `/api/documents/${id}/content${download ? '?download=1' : ''}`;
}
