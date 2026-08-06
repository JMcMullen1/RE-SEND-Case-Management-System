import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { CaseListRow, OwnerQueue } from '@re-send/shared';
import type { UserSummary } from '../../api/client';
import { CaseRow } from './CaseRow';
import { COLUMN_META, type ColumnId } from './columns';

type Target = { ownerUserId: string } | { ownerQueue: OwnerQueue };

export function CaseTable({
  rows,
  columns,
  template,
  today,
  users,
  compact,
  expanded,
  onToggleExpand,
  selectable,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onReassign,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
}: {
  rows: CaseListRow[];
  columns: ColumnId[];
  template: string;
  today: string;
  users: UserSummary[];
  compact: boolean;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  selectable: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onReassign: (id: string, target: Target) => void;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const estimate = compact ? 46 : 74;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimate,
    overscan: 8,
    getItemKey: (index) => rows[index]?.id ?? index,
  });

  const items = virtualizer.getVirtualItems();
  const last = items[items.length - 1];
  useEffect(() => {
    if (
      last &&
      last.index >= rows.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [last, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allSelected =
    selectable && rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="flex h-full flex-col">
      <div
        role="row"
        className="grid items-center gap-3 border-b border-gray-200 pl-3.5 pr-4 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
        style={{ gridTemplateColumns: template }}
      >
        {columns.map((id) => (
          <div key={id} role="columnheader">
            {id === 'select' ? (
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                aria-label="Select all cases"
                className="h-4 w-4 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
              />
            ) : (
              COLUMN_META[id].header
            )}
          </div>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto" tabIndex={-1}>
        <div
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
        >
          {items.map((item) => {
            const row = rows[item.index]!;
            return (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <CaseRow
                  row={row}
                  columns={columns}
                  template={template}
                  today={today}
                  users={users}
                  compact={compact}
                  expanded={expanded.has(row.id)}
                  onToggleExpand={() => onToggleExpand(row.id)}
                  selected={selected.has(row.id)}
                  onToggleSelect={() => onToggleSelect(row.id)}
                  onReassign={(target) => onReassign(row.id, target)}
                />
              </div>
            );
          })}
        </div>
        {isFetchingNextPage && (
          <p className="py-3 text-center text-sm text-gray-400">
            Loading more…
          </p>
        )}
      </div>
    </div>
  );
}
