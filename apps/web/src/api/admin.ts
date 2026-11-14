import type { OwnerQueue, StaffMember, UserRole } from '@re-send/shared';
import { request } from './client';

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
