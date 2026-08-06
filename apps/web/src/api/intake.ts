import type { IntakeResponse } from '@re-send/shared';
import { getActingUserId, request } from './client';

/** Smart-fill from an uploaded submission (PDF/DOCX/HTML/.eml/text). */
export async function smartFillFile(
  file: File,
  source: 'form' | 'email',
): Promise<IntakeResponse> {
  const form = new FormData();
  form.append('file', file);
  const headers = new Headers();
  const acting = getActingUserId();
  if (acting) headers.set('x-user-id', acting);
  const res = await fetch(`/api/intake/extract?source=${source}`, {
    method: 'POST',
    body: form,
    headers,
  });
  if (!res.ok)
    return { status: 'error', message: `Upload failed (${res.status})` };
  return (await res.json()) as IntakeResponse;
}

/** Smart-fill from pasted text (an enquiry email or a copied form). */
export function smartFillText(
  text: string,
  source: 'form' | 'email',
): Promise<IntakeResponse> {
  return request('/api/intake/extract-text', {
    method: 'POST',
    body: JSON.stringify({ text, source }),
  });
}
