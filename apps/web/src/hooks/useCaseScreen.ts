import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reassignCase, type UserSummary } from '../api/client';
import {
  addNote,
  createKeyDate,
  deleteKeyDate,
  editNote,
  fetchCaseDetail,
  fetchDocuments,
  fetchTimeline,
  patchCaseFields,
  patchChild,
  patchClient,
  patchKeyDate,
  setCaseTeams,
} from '../api/caseScreen';

type OwnerTarget =
  { ownerUserId: string } | { ownerQueue: 'Enquiries' | 'TSA Team' };
export type { UserSummary };

export function useCaseDetail(id: string) {
  return useQuery({
    queryKey: ['case-detail', id],
    queryFn: () => fetchCaseDetail(id),
  });
}

export function useTimeline(
  id: string,
  filters: { author?: string; from?: string; to?: string; q?: string },
) {
  return useQuery({
    queryKey: ['timeline', id, filters],
    queryFn: () => fetchTimeline(id, filters),
  });
}

export function useDocuments(id: string) {
  return useQuery({
    queryKey: ['documents', id],
    queryFn: () => fetchDocuments(id),
  });
}

/** Invalidate every query the mutations touch for a case. */
function useCaseInvalidation(id: string) {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: ['case-detail', id] });
    qc.invalidateQueries({ queryKey: ['timeline', id] });
    qc.invalidateQueries({ queryKey: ['documents', id] });
    qc.invalidateQueries({ queryKey: ['cases'] });
  }, [qc, id]);
}

export function useCaseMutations(id: string) {
  const invalidate = useCaseInvalidation(id);
  const opts = { onSuccess: invalidate };

  return {
    patchCase: useMutation({
      mutationFn: (patch: Record<string, unknown>) =>
        patchCaseFields(id, patch),
      ...opts,
    }),
    patchClient: useMutation({
      mutationFn: (v: { clientId: string; patch: Record<string, unknown> }) =>
        patchClient(v.clientId, v.patch),
      ...opts,
    }),
    patchChild: useMutation({
      mutationFn: (v: { childId: string; patch: Record<string, unknown> }) =>
        patchChild(v.childId, v.patch),
      ...opts,
    }),
    setTeams: useMutation({
      mutationFn: (team: ('TSA' | 'ISA')[]) => setCaseTeams(id, team),
      ...opts,
    }),
    addKeyDate: useMutation({
      mutationFn: (input: Record<string, unknown>) => createKeyDate(id, input),
      ...opts,
    }),
    editKeyDate: useMutation({
      mutationFn: (v: { id: string; patch: Record<string, unknown> }) =>
        patchKeyDate(v.id, v.patch),
      ...opts,
    }),
    removeKeyDate: useMutation({
      mutationFn: (keyDateId: string) => deleteKeyDate(keyDateId),
      ...opts,
    }),
    addNote: useMutation({
      mutationFn: (body: string) => addNote(id, body),
      ...opts,
    }),
    editNote: useMutation({
      mutationFn: (v: { id: string; body: string }) => editNote(v.id, v.body),
      ...opts,
    }),
    reassign: useMutation({
      mutationFn: (target: OwnerTarget) => reassignCase(id, target),
      ...opts,
    }),
  };
}

/** Refetch this case's data when the live channel reports a change to it. */
export function useCaseRealtime(id: string): void {
  const invalidate = useCaseInvalidation(id);
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    let socket: WebSocket | null = null;
    let retry: number | undefined;
    const connect = () => {
      try {
        socket = new WebSocket(`${proto}://${window.location.host}/api/ws`);
        socket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as { caseId?: string };
            if (msg.caseId === id) invalidate();
          } catch {
            /* ignore malformed */
          }
        };
        socket.onclose = () => {
          retry = window.setTimeout(connect, 3000);
        };
      } catch {
        retry = window.setTimeout(connect, 3000);
      }
    };
    connect();
    return () => {
      if (retry) window.clearTimeout(retry);
      socket?.close();
    };
  }, [id, invalidate]);
}
