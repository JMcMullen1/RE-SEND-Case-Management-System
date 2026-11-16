import type { OwnerQueue, StaffMember, UserRole } from '@re-send/shared';
import { request } from './client';
import { postFileWithProgress } from './documents';

export function fetchStaff(): Promise<{ staff: StaffMember[] }> {
  return request('/api/admin/staff');
}

export function addStaff(input: {
  displayName: string;
  email: string;
  role: UserRole;
}): Promise<StaffMember> {
  return request('/api/admin/staff', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateStaff(
  id: string,
  patch: { displayName?: string; email?: string; role?: UserRole },
): Promise<StaffMember> {
  return request(`/api/admin/staff/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export type Handover =
  | { kind: 'queue'; queue: OwnerQueue }
  | { kind: 'user'; userId: string }
  | { kind: 'none' };

export function markLeaver(
  id: string,
  handover: Handover,
): Promise<{ member: StaffMember; casesHandedOver: number }> {
  return request(`/api/admin/staff/${id}/deactivate`, {
    method: 'POST',
    body: JSON.stringify({ handover }),
  });
}

export function bringBack(id: string): Promise<StaffMember> {
  return request(`/api/admin/staff/${id}/reactivate`, { method: 'POST' });
}

/** The full export downloads as a file through the session cookie. */
export const EXPORT_URL = '/api/admin/export';

export interface BackupSummary {
  createdAt: string;
  createdBy: string;
  tables: number;
  rows: number;
  files: number;
}

/** Full import, step 1: upload a full export to be checked (nothing changes). */
export function checkBackup(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<{ id: string; summary: BackupSummary }> {
  return postFileWithProgress('/api/admin/restore/check', file, onProgress);
}

/** Full import, step 2: start replacing everything with the checked backup. */
export function runRestore(id: string): Promise<{ started: true }> {
  return request(`/api/admin/restore/${id}`, {
    method: 'POST',
    body: JSON.stringify({ confirm: 'REPLACE' }),
  });
}

export type RestoreStatus =
  | { state: 'idle' }
  | { state: 'running'; startedAt: string }
  | { state: 'done'; rows: number; files: number; finishedAt: string }
  | { state: 'failed'; message: string; finishedAt: string };

/** Where the restore this admin started stands. */
export function restoreStatus(): Promise<RestoreStatus> {
  return request('/api/admin/restore/status');
}
