import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  encodeViewState,
  type CaseListRow,
  type ConsultationState,
  type CaseOwner,
  type OwnerQueue,
  type Status,
  type Team,
  type ViewState,
  type WorkType,
} from '@re-send/shared';
import { patchCaseFields, setCaseTeams } from '../api/caseScreen';
import {
  createSavedView,
  deleteSavedView,
  fetchCases,
  fetchExpansion,
  fetchMe,
  fetchSavedViews,
  fetchUsers,
  reassignCase,
  reassignManyCases,
  type CaseListResponse,
  type UserSummary,
} from '../api/client';

const PAGE = 50;

export function useCases(state: ViewState) {
  const key = encodeViewState(state).toString();
  const query = useInfiniteQuery({
    queryKey: ['cases', key],
    queryFn: ({ pageParam }) => fetchCases(state, pageParam, PAGE),
    initialPageParam: 0,
    getNextPageParam: (last: CaseListResponse) => last.nextOffset ?? undefined,
  });
  const pages = query.data?.pages ?? [];
  return {
    ...query,
    rows: pages.flatMap((p) => p.rows),
    total: pages[0]?.total ?? 0,
    facetCounts: pages[0]?.facetCounts ?? {},
  };
}

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: fetchMe });
}

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: fetchUsers });
}

export function useSavedViews() {
  return useQuery({ queryKey: ['saved-views'], queryFn: fetchSavedViews });
}

export function useExpansion(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['expansion', id],
    queryFn: () => fetchExpansion(id),
    enabled,
  });
}

type OwnerTarget = { ownerUserId: string } | { ownerQueue: OwnerQueue };

type CasesPage = { pages: CaseListResponse[]; pageParams: unknown[] };

export function ownerFromTarget(
  target: OwnerTarget,
  users: UserSummary[],
): CaseOwner {
  return 'ownerUserId' in target
    ? {
        kind: 'user',
        userId: target.ownerUserId,
        displayName:
          users.find((u) => u.id === target.ownerUserId)?.displayName ?? '',
      }
    : { kind: 'queue', queue: target.ownerQueue };
}

/** Inline owner reassignment with an optimistic update and rollback on error. */
export function useReassign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, target }: { id: string; target: OwnerTarget }) =>
      reassignCase(id, target),
    onMutate: async ({ id, target }) => {
      await qc.cancelQueries({ queryKey: ['cases'] });
      const snapshots = qc.getQueriesData<CasesPage>({ queryKey: ['cases'] });
      const users =
        qc.getQueryData<{ users: UserSummary[] }>(['users'])?.users ?? [];
      const owner = ownerFromTarget(target, users);
      qc.setQueriesData<CasesPage>({ queryKey: ['cases'] }, (old) =>
        old?.pages
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                rows: page.rows.map((row: CaseListRow) =>
                  row.id === id ? { ...row, owner } : row,
                ),
              })),
            }
          : old,
      );
      return { snapshots };
    },
    onError: (_error, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['cases'] }),
  });
}

export function useBulkReassign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, target }: { ids: string[]; target: OwnerTarget }) =>
      reassignManyCases(ids, target),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cases'] }),
  });
}

export function useSaveView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createSavedView,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-views'] }),
  });
}

export function useDeleteView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteSavedView,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-views'] }),
  });
}

/**
 * Change one row's fields on the case list straight away (shown at once,
 * put back if the save fails), then refresh the list from the server.
 */
function useRowEdit<V extends { id: string }>(
  save: (vars: V) => Promise<unknown>,
  apply: (row: CaseListRow, vars: V) => CaseListRow,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: save,
    onMutate: async (vars: V) => {
      await qc.cancelQueries({ queryKey: ['cases'] });
      const snapshots = qc.getQueriesData<CasesPage>({ queryKey: ['cases'] });
      qc.setQueriesData<CasesPage>({ queryKey: ['cases'] }, (old) =>
        old?.pages
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                rows: page.rows.map((row: CaseListRow) =>
                  row.id === vars.id ? apply(row, vars) : row,
                ),
              })),
            }
          : old,
      );
      return { snapshots };
    },
    onError: (_error, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: (_data, _error, vars) => {
      void qc.invalidateQueries({ queryKey: ['cases'] });
      void qc.invalidateQueries({ queryKey: ['case-detail', vars.id] });
    },
  });
}

/** Change a case's status from the case list. */
export function useSetStatus() {
  return useRowEdit(
    ({ id, status }: { id: string; status: Status }) =>
      patchCaseFields(id, { status }),
    (row, { status }) => ({ ...row, status }),
  );
}

/** Change which teams a case sits with from the case list. */
export function useSetTeams() {
  return useRowEdit(
    ({ id, team }: { id: string; team: Team[] }) => setCaseTeams(id, team),
    (row, { team }) => ({ ...row, team }),
  );
}

/** Change a case's type of case (its current work) from the case list. */
export function useSetWorkType() {
  return useRowEdit(
    ({ id, currentWork }: { id: string; currentWork: WorkType }) =>
      patchCaseFields(id, { currentWork }),
    (row, { currentWork }) => ({ ...row, currentWork }),
  );
}

/** Change whether a case's consultation is done, from the case list. */
export function useSetConsultation() {
  return useRowEdit(
    ({ id, consultStatus }: { id: string; consultStatus: ConsultationState }) =>
      patchCaseFields(id, { consultStatus }),
    (row, { consultStatus }) => ({ ...row, consultStatus }),
  );
}
