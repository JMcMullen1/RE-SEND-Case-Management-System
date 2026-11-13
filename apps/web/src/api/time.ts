import type { RateKind, StaffRates, TimeReport } from '@re-send/shared';
import type { UserSummary } from './client';
import { request } from './client';

export function fetchTimeReport(params: {
  from: string;
  to: string;
  userId?: string;
}): Promise<TimeReport> {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.userId) q.set('userId', params.userId);
  return request(`/api/time?${q.toString()}`);
}

export function fetchStaffRates(): Promise<{ staff: StaffRates[] }> {
  return request('/api/admin/rates');
}

export function setStaffRate(input: {
  userId: string;
  kind: RateKind;
  ratePence: number;
  effectiveFrom: string;
}): Promise<{ staff: StaffRates[] }> {
  return request('/api/admin/rates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteStaffRate(id: string): Promise<{ staff: StaffRates[] }> {
  return request(`/api/admin/rates/${id}`, { method: 'DELETE' });
}

/** Everyone with an account, leavers included (admins only). */
export function fetchPeople(): Promise<{ users: UserSummary[] }> {
  return request('/api/admin/people');
}
