import type { CaseClientDetail, IntakeRef } from '@re-send/shared';
import { request } from './client';

export interface CreateCasePayload {
  existingClientId?: string;
  client?: Record<string, unknown>;
  existingChildId?: string;
  child?: Record<string, unknown>;
  case: Record<string, unknown>;
  firstNote?: string;
  keyDates?: {
    date: string;
    title: string;
    type: string;
    confidence?: number;
  }[];
  intake?: IntakeRef;
}

export function createCase(
  payload: CreateCasePayload,
): Promise<{ caseId: string; caseReference: string }> {
  return request('/api/cases', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface MatchResult {
  clientMatches: {
    clientId: string;
    displayName: string;
    email: string | null;
    cases: { caseId: string; caseReference: string }[];
  }[];
  childMatches: {
    childId: string;
    fullName: string;
    dateOfBirth: string | null;
    clientId: string | null;
    clientDisplayName: string | null;
    cases: { caseId: string; caseReference: string }[];
  }[];
}

export function fetchMatches(params: {
  childName?: string;
  dob?: string;
  email?: string;
}): Promise<MatchResult> {
  const q = new URLSearchParams();
  if (params.childName) q.set('childName', params.childName);
  if (params.dob) q.set('dob', params.dob);
  if (params.email) q.set('email', params.email);
  return request(`/api/matches?${q.toString()}`);
}

export function fetchClient(id: string): Promise<CaseClientDetail> {
  return request(`/api/clients/${id}`);
}
