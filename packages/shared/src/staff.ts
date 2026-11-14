/**
 * staff.ts — staff administration: the shape the admin screen shows, and the
 * rules that keep the system usable (there is always an active admin; nobody
 * signs themselves out of it by accident).
 */

import type { UserRole } from './config';

export interface StaffMember {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  active: boolean;
  /** Cases not closed that this person owns. */
  openCaseCount: number;
}

/** Lower-cased, trimmed email, for comparison and storage. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Why a change to a member of staff cannot be made, or null. `activeAdmins` is
 * the number of active admins before the change.
 */
export function staffChangeProblem(opts: {
  actorId: string;
  target: { id: string; role: UserRole; active: boolean };
  change: { role?: UserRole; active?: boolean };
  activeAdmins: number;
}): string | null {
  const { actorId, target, change, activeAdmins } = opts;
  const losesAdmin =
    target.active &&
    target.role === 'admin' &&
    ((change.role !== undefined && change.role !== 'admin') ||
      change.active === false);
  if (losesAdmin && target.id === actorId)
    return 'You cannot remove your own admin access. Ask another admin.';
  if (losesAdmin && activeAdmins <= 1)
    return 'There must always be at least one active admin.';
  return null;
}
