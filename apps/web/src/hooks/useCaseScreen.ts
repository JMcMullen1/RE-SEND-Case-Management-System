import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CaseDetail, NoteKind } from '@re-send/shared';
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
  filters: {
    author?: string;
    from?: string;
    to?: string;
    q?: string;
    kind?: NoteKind;
  },
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
  const qc = useQueryClient();
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
      mutationFn: (v: { body: string; kind: NoteKind }) =>
        addNote(id, v.body, v.kind),
      ...opts,
    }),
    editNote: useMutation({
      mutationFn: (v: { id: string; body: string }) => editNote(v.id, v.body),
      ...opts,
    }),
    // Optimistic owner reassignment with rollback on error.
    reassign: useMutation({
      mutationFn: (target: OwnerTarget) => reassignCase(id, target),
      onMutate: async (target: OwnerTarget) => {
        await qc.cancelQueries({ queryKey: ['case-detail', id] });
        const previous = qc.getQueryData<CaseDetail>(['case-detail', id]);
        const users =
          qc.getQueryData<{ users: UserSummary[] }>(['users'])?.users ?? [];
        qc.setQueryData<CaseDetail>(['case-detail', id], (old) =>
          old ? { ...old, owner: ownerDetail(target, users) } : old,
        );
        return { previous };
      },
      onError: (_error, _target, ctx) => {
        if (ctx?.previous) qc.setQueryData(['case-detail', id], ctx.previous);
      },
      onSettled: invalidate,
    }),
  };
}

function ownerDetail(
  target: OwnerTarget,
  users: UserSummary[],
): CaseDetail['owner'] {
  return 'ownerUserId' in target
    ? {
        kind: 'user',
        userId: target.ownerUserId,
        displayName:
          users.find((u) => u.id === target.ownerUserId)?.displayName ?? '',
        queue: null,
      }
    : {
        kind: 'queue',
        userId: null,
        displayName: null,
        queue: target.ownerQueue,
      };
}
