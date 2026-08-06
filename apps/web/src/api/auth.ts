import { request, type UserSummary } from './client';

export interface DemoAccount {
  email: string;
  displayName: string;
}

/** The current session, or a 401 (ApiError) when not signed in. */
export function fetchSession(): Promise<UserSummary> {
  return request<UserSummary>('/api/auth/session');
}

/** Whether demo login is on, and the accounts that can be used. */
export function fetchAccounts(): Promise<{
  demoMode: boolean;
  accounts: DemoAccount[];
}> {
  return request('/api/auth/accounts');
}

export function login(email: string, password: string): Promise<UserSummary> {
  return request<UserSummary>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logout(): Promise<{ ok: true }> {
  return request('/api/auth/logout', { method: 'POST' });
}

export function resetDemo(): Promise<{ ok: true }> {
  return request('/api/demo/reset', { method: 'POST' });
}
