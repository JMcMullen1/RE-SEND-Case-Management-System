import type {
  CaseImportAnalysis,
  CaseImportRequest,
  CaseImportRow,
} from '@re-send/shared';
import { request } from './client';

/** The preview as the API returns it (the import plan stays on the server). */
export type ImportPreview = Omit<CaseImportAnalysis, 'rows'> & {
  rows: Omit<CaseImportRow, 'plan'>[];
  /** Identifies exactly the list checked; the import must match it. */
  fingerprint: string;
};

export interface ImportResult {
  batchId: string;
  casesCreated: number;
  clientsCreated: number;
  childrenCreated: number;
  duplicatesSkipped: number;
  problemsSkipped: number;
}

export function previewImport(body: CaseImportRequest): Promise<ImportPreview> {
  return request('/api/admin/import/cases/preview', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function runImport(
  body: CaseImportRequest,
  preview: ImportPreview,
): Promise<ImportResult> {
  return request('/api/admin/import/cases', {
    method: 'POST',
    body: JSON.stringify({
      ...body,
      expectedFingerprint: preview.fingerprint,
      expectedToImport: preview.summary.toImport,
    }),
  });
}
