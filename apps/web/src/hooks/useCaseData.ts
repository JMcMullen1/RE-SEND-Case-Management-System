import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  encodeViewState,
  type CaseListRow,
  type CaseOwner,
  type OwnerQueue,
  type ViewState,
} from '@re-send/shared';
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
        old
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
