import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  hasActiveFilters,
  PRODUCT_NAME,
  STRAPLINE,
  type CaseFilters,
  type OwnerQueue,
  type ViewState,
} from '@re-send/shared';
import { getActingUserId, setActingUserId } from '../../api/client';
import { useToday } from '../../hooks/useToday';
import { useViewState } from '../../hooks/useViewState';
import {
  useBulkReassign,
  useCases,
  useDeleteView,
  useReassign,
  useSavedViews,
  useSaveView,
  useUsers,
} from '../../hooks/useCaseData';
import { gridTemplate, visibleColumns } from './columns';
import {
  DensityToggle,
  SearchBox,
  SegmentedControl,
  SortSelect,
} from './Controls';
import { QuickFilters } from './QuickFilters';
import { ActiveFilterChips } from './ActiveFilterChips';
import { FiltersPopover } from './FiltersPopover';
import { ColumnChooser } from './ColumnChooser';
import { SavedViewsMenu } from './SavedViewsMenu';
import { BulkBar } from './BulkBar';
import { CaseTable } from './CaseTable';
import { EmptyFirstRun, EmptyNoMatch } from './EmptyStates';

type Target = { ownerUserId: string } | { ownerQueue: OwnerQueue };

export function CaseListPage() {
  const [state, update] = useViewState();
  const today = useToday();

  const qc = useQueryClient();
  const usersQuery = useUsers();
  const users = usersQuery.data?.users ?? [];
  const savedViews = useSavedViews();
  const cases = useCases(state);
  const reassign = useReassign();
  const bulkReassign = useBulkReassign();
  const saveView = useSaveView();
  const deleteView = useDeleteView();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const advanced = state.mode === 'advanced';
  const columns = visibleColumns(state);
  const template = gridTemplate(columns);

  const setFilters = (filters: CaseFilters) => update({ filters });
  const applyState = (next: ViewState) => update(() => next);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAll = () =>
    setSelected((prev) =>
      prev.size === cases.rows.length
        ? new Set()
        : new Set(cases.rows.map((r) => r.id)),
    );

  const doReassign = (id: string, target: Target) =>
    reassign.mutate({ id, target });
  const doBulk = (target: Target) => {
    bulkReassign.mutate({ ids: [...selected], target });
    setSelected(new Set());
  };

  const filtersActive =
    hasActiveFilters(state.filters) || state.search.trim().length > 0;
  const showFirstRun = !filtersActive && cases.total === 0 && !cases.isLoading;
  const showNoMatch =
    filtersActive && cases.rows.length === 0 && !cases.isLoading;

  return (
    <div className="flex h-screen flex-col bg-white text-resend-ink">
      <header className="border-b border-gray-200 px-6 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="mr-auto">
            <h1 className="text-lg font-semibold text-resend-purple">
              {PRODUCT_NAME} cases
            </h1>
            <p className="text-xs text-gray-500">{STRAPLINE}</p>
          </div>
          <SegmentedControl
            mode={state.mode}
            onChange={(mode) => update({ mode })}
          />
          <SavedViewsMenu
            seeds={savedViews.data?.seeds ?? []}
            views={savedViews.data?.views ?? []}
            onApply={applyState}
            onSave={(name, shared) => saveView.mutate({ name, shared, state })}
            onDelete={(id) => deleteView.mutate(id)}
          />
          <a
            href="/cases/new"
            className="rounded-lg bg-resend-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Add a case
          </a>
          <UserSwitcher
            users={users}
            onSwitch={(id) => {
              setActingUserId(id);
              qc.invalidateQueries();
            }}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="min-w-[240px] flex-1">
            <SearchBox
              value={state.search}
              onChange={(search) => update({ search })}
            />
          </div>
          <SortSelect sort={state.sort} onChange={(sort) => update({ sort })} />
          {advanced && (
            <>
              <FiltersPopover
                filters={state.filters}
                counts={cases.facetCounts}
                users={users}
                onChange={setFilters}
              />
              <ColumnChooser
                columns={state.columns}
                onChange={(cols) => update({ columns: cols })}
              />
              <DensityToggle
                density={state.density}
                onChange={(density) => update({ density })}
              />
            </>
          )}
        </div>

        <div className="mt-3">
          <QuickFilters filters={state.filters} onChange={setFilters} />
        </div>

        <div className="mt-3">
          <ActiveFilterChips
            filters={state.filters}
            users={users}
            onChange={setFilters}
          />
        </div>

        {advanced && selected.size > 0 && (
          <div className="mt-3">
            <BulkBar
              count={selected.size}
              users={users}
              onReassign={doBulk}
              onClear={() => setSelected(new Set())}
            />
          </div>
        )}
      </header>

      <main className="min-h-0 flex-1 px-6 py-2">
        {cases.isLoading && (
          <p className="py-10 text-center text-sm text-gray-400">
            Loading cases…
          </p>
        )}
        {showFirstRun && <EmptyFirstRun />}
        {showNoMatch && (
          <EmptyNoMatch
            filters={state.filters}
            users={users}
            onChange={setFilters}
          />
        )}
        {!cases.isLoading && !showFirstRun && !showNoMatch && (
          <CaseTable
            rows={cases.rows}
            columns={columns}
            template={template}
            today={today}
            users={users}
            compact={state.density === 'compact'}
            expanded={expanded}
            onToggleExpand={toggleExpand}
            selectable={advanced}
            selected={selected}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onReassign={doReassign}
            hasNextPage={Boolean(cases.hasNextPage)}
            fetchNextPage={() => void cases.fetchNextPage()}
            isFetchingNextPage={cases.isFetchingNextPage}
          />
        )}
      </main>
    </div>
  );
}

function UserSwitcher({
  users,
  onSwitch,
}: {
  users: { id: string; displayName: string }[];
  onSwitch: (id: string) => void;
}) {
  if (users.length === 0) return null;
  return (
    <label className="flex items-center gap-1 text-xs text-gray-500">
      <span className="sr-only">Acting as</span>
      <select
        defaultValue={getActingUserId() ?? ''}
        onChange={(e) => onSwitch(e.target.value)}
        className="rounded border border-gray-200 bg-white px-1 py-0.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        aria-label="Acting as user"
      >
        <option value="">Acting as…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
