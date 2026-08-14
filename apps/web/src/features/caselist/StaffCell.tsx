import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  OWNER_QUEUE_VALUES,
  type CaseListRow,
  type OwnerQueue,
} from '@re-send/shared';
import type { UserSummary } from '../../api/client';
import { CaretDown, UnassignedChip } from './primitives';

type Target = { ownerUserId: string } | { ownerQueue: OwnerQueue };

/** Where the floating menu is pinned, in viewport coordinates. */
type MenuPos = { left: number; top?: number; bottom?: number };

const MENU_WIDTH = 224; // w-56
const MENU_MAX_HEIGHT = 288; // max-h-72

/**
 * Staff cell with inline owner reassignment. The menu is rendered in a portal
 * pinned to the button's position rather than positioned inside the cell: the
 * case list scrolls in a virtualised `overflow-auto` container, which would
 * otherwise clip an absolutely-positioned dropdown so it never appeared.
 */
export function StaffCell({
  row,
  users,
  onReassign,
}: {
  row: CaseListRow;
  users: UserSummary[];
  onReassign: (target: Target) => void;
}) {
  const [pos, setPos] = useState<MenuPos | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  const openMenu = () => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(r.left, window.innerWidth - MENU_WIDTH - 8),
    );
    // Open downward, or flip above the button when there isn't room below.
    const spaceBelow = window.innerHeight - r.bottom;
    if (spaceBelow < MENU_MAX_HEIGHT && r.top > spaceBelow) {
      setPos({ left, bottom: window.innerHeight - r.top + 4 });
    } else {
      setPos({ left, top: r.bottom + 4 });
    }
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t))
        return;
      setPos(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPos(null);
    };
    // The button can scroll away from a pinned menu; closing is the simplest,
    // least surprising behaviour. Capture catches the inner scroll container.
    const onScroll = () => setPos(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const choose = (target: Target) => {
    setPos(null);
    onReassign(target);
  };

  // Staff, A–Z by name. The API already returns them sorted; this keeps the
  // order correct regardless of source.
  const sortedUsers = [...users].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );

  return (
    <>
      {/* Looks and behaves like the owner control inside a case: a bordered,
          clearly-clickable button that opens the staff list. */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setPos(null) : openMenu())}
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

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              width: MENU_WIDTH,
              maxHeight: MENU_MAX_HEIGHT,
            }}
            className="z-50 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
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
          </div>,
          document.body,
        )}
    </>
  );
}
