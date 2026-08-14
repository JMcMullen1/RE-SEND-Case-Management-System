import { useEffect, useRef, useState } from 'react';
import {
  OWNER_QUEUE_VALUES,
  type CaseListRow,
  type OwnerQueue,
} from '@re-send/shared';
import type { UserSummary } from '../../api/client';
import { CaretDown, UnassignedChip } from './primitives';

type Target = { ownerUserId: string } | { ownerQueue: OwnerQueue };

/** Staff cell with inline owner reassignment. */
export function StaffCell({
  row,
  users,
  onReassign,
}: {
  row: CaseListRow;
  users: UserSummary[];
  onReassign: (target: Target) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (target: Target) => {
    setOpen(false);
    onReassign(target);
  };

  // Staff, A–Z by name. The API already returns them sorted; this keeps the
  // order correct regardless of source.
  const sortedUsers = [...users].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );

  return (
    <div ref={ref} className="relative">
      {/* Looks and behaves like the owner control inside a case: a bordered,
          clearly-clickable button that opens the staff list. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex max-w-full items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-left text-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        {row.owner.kind === 'user' ? (
          <span className="truncate text-resend-ink">
            {row.owner.displayName}
          </span>
        ) : (
          <UnassignedChip queue={row.owner.queue} />
        )}
        <CaretDown />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute z-20 mt-1 max-h-72 w-56 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-gray-400">
            Assign to
          </p>
          {sortedUsers.map((u) => (
            <button
              key={u.id}
              type="button"
              role="menuitem"
              onClick={() => choose({ ownerUserId: u.id })}
              className="block w-full px-3 py-1.5 text-left text-sm text-resend-ink hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
            >
              {u.displayName}
            </button>
          ))}
          <p className="mt-1 border-t border-gray-100 px-3 pt-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            Queue
          </p>
          {OWNER_QUEUE_VALUES.map((q) => (
            <button
              key={q}
              type="button"
              role="menuitem"
              onClick={() => choose({ ownerQueue: q })}
              className="block w-full px-3 py-1.5 text-left text-sm text-resend-ink hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
