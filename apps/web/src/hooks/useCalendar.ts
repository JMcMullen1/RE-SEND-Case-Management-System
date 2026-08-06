import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bankHolidays, type CalendarFilters } from '@re-send/shared';
import { createKeyDate, deleteKeyDate, patchKeyDate } from '../api/caseScreen';
import { fetchBankHolidays, fetchCalendar } from '../api/calendar';

/**
 * Calendar events for the given filters and range. The query key starts with
 * `['calendar']` so the live-update channel (which invalidates `['calendar']`
 * on any key-date change) refreshes every open calendar view.
 */
export function useCalendar(filters: CalendarFilters) {
  return useQuery({
    queryKey: ['calendar', filters],
    queryFn: () => fetchCalendar(filters),
  });
}

/** Bank holidays for working-day-aware pickers — a `Holidays` lookup. */
export function useHolidays() {
  const query = useQuery({
    queryKey: ['bank-holidays'],
    queryFn: fetchBankHolidays,
    staleTime: 24 * 60 * 60 * 1000,
  });
  return query.data ? bankHolidays(query.data.events) : null;
}

/** Create, edit and remove key dates from the calendar; refresh on success. */
export function useKeyDateMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['calendar'] });
    void qc.invalidateQueries({ queryKey: ['cases'] });
  };
  return {
    add: useMutation({
      mutationFn: ({
        caseId,
        input,
      }: {
        caseId: string;
        input: Record<string, unknown>;
      }) => createKeyDate(caseId, input),
      onSuccess: invalidate,
    }),
    edit: useMutation({
      mutationFn: ({
        id,
        patch,
      }: {
        id: string;
        patch: Record<string, unknown>;
        caseId?: string;
      }) => patchKeyDate(id, patch),
      onSuccess: (_data, vars) => {
        invalidate();
        if (vars.caseId)
          void qc.invalidateQueries({ queryKey: ['case-detail', vars.caseId] });
      },
    }),
    remove: useMutation({
      mutationFn: ({ id }: { id: string; caseId?: string }) =>
        deleteKeyDate(id),
      onSuccess: invalidate,
    }),
  };
}
