import { useEffect } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  encodeViewState,
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

export function useReassign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, target }: { id: string; target: OwnerTarget }) =>
      reassignCase(id, target),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cases'] }),
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

/** Subscribe to the live channel; refetch the list on any case/key-date change. */
export function useRealtime(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    let socket: WebSocket | null = null;
    let retry: number | undefined;
    const connect = () => {
      try {
        socket = new WebSocket(`${proto}://${window.location.host}/api/ws`);
        socket.onmessage = () => qc.invalidateQueries({ queryKey: ['cases'] });
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
  }, [qc]);
}
