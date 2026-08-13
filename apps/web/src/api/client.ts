import type {
  CaseListRow,
  NoteKind,
  OwnerQueue,
  SavedViewSeed,
  ViewState,
} from '@re-send/shared';
import { encodeViewState } from '@re-send/shared';

export interface UserSummary {
  id: string;
  displayName: string;
  role: string;
  active: boolean;
}

export interface CaseListResponse {
  rows: CaseListRow[];
  total: number;
  nextOffset: number | null;
  facetCounts: Record<string, Record<string, number>>;
}

export interface SavedView {
  id: string;
  name: string;
  ownerUserId: string | null;
  shared: boolean;
  state: ViewState;
}

export interface CaseExpansion {
  notes: {
    entryDate: string;
    author: string | null;
    body: string;
    kind: NoteKind;
  }[];
  email: string | null;
  phone: string | null;
  mobile: string | null;
}

const USER_KEY = 'resend.currentUserId';

export function getActingUserId(): string | null {
  return localStorage.getItem(USER_KEY);
}
export function setActingUserId(id: string | null): void {
  if (id) localStorage.setItem(USER_KEY, id);
  else localStorage.removeItem(USER_KEY);
}

/** An HTTP error carrying its status, so callers can branch on 401 vs. others. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  // Only advertise a JSON body when one is actually sent. A content-type of
  // application/json with an empty body makes Fastify reject the request with
  // 400 (FST_ERR_CTP_EMPTY_JSON_BODY) — which broke the bodyless POSTs (sign
  // out, reset demo).
  if (init?.body != null) headers.set('content-type', 'application/json');
  const acting = getActingUserId();
  if (acting) headers.set('x-user-id', acting);
  // Include the session cookie on every request (needed if the API is ever on
  // a different origin than the static app).
  const res = await fetch(url, { ...init, headers, credentials: 'include' });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export function fetchMe(): Promise<UserSummary> {
  return request<UserSummary>('/api/me');
}

export function fetchUsers(): Promise<{ users: UserSummary[] }> {
  return request<{ users: UserSummary[] }>('/api/users');
}

export function fetchCases(
  state: ViewState,
  offset: number,
  limit = 50,
): Promise<CaseListResponse> {
  const params = encodeViewState(state);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return request<CaseListResponse>(`/api/cases?${params.toString()}`);
}

export function fetchExpansion(id: string): Promise<CaseExpansion> {
  return request<CaseExpansion>(`/api/cases/${id}/expansion`);
}

/** Delete a case. Admin-only and name-confirmed; the server enforces both. */
export function deleteCase(
  id: string,
  confirmName: string,
): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/cases/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirmName }),
  });
}

export function reassignCase(
  id: string,
  target: { ownerUserId: string } | { ownerQueue: OwnerQueue },
): Promise<{ row: CaseListRow }> {
  return request<{ row: CaseListRow }>(`/api/cases/${id}/owner`, {
    method: 'PATCH',
    body: JSON.stringify(target),
  });
}

export function reassignManyCases(
  caseIds: string[],
  target: { ownerUserId: string } | { ownerQueue: OwnerQueue },
): Promise<{ updated: number }> {
  return request<{ updated: number }>('/api/cases/reassign', {
    method: 'POST',
    body: JSON.stringify({ caseIds, ...target }),
  });
}

export function fetchSavedViews(): Promise<{
  seeds: SavedViewSeed[];
  views: SavedView[];
}> {
  return request<{ seeds: SavedViewSeed[]; views: SavedView[] }>(
    '/api/saved-views',
  );
}

export function createSavedView(input: {
  name: string;
  shared: boolean;
  state: ViewState;
}): Promise<{ view: SavedView }> {
  return request<{ view: SavedView }>('/api/saved-views', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteSavedView(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/saved-views/${id}`, { method: 'DELETE' });
}
