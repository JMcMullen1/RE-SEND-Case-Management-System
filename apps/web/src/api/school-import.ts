import type {
  ImportedSchool,
  SchoolImportPreview,
  SchoolImportResult,
} from '@re-send/shared';
import { request } from './client';

/** What importing these schools would do (changes nothing). */
export function previewSchoolImport(
  schools: ImportedSchool[],
): Promise<SchoolImportPreview> {
  return request('/api/admin/import/schools/preview', {
    method: 'POST',
    body: JSON.stringify({ schools }),
  });
}

export function runSchoolImport(
  schools: ImportedSchool[],
): Promise<SchoolImportResult> {
  return request('/api/admin/import/schools', {
    method: 'POST',
    body: JSON.stringify({ schools }),
  });
}
