import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Where the floating menu is pinned, in viewport coordinates. */
type MenuPos = { left: number; top?: number; bottom?: number };

const MENU_WIDTH = 224; // w-56
const MENU_MAX_HEIGHT = 320;

/**
 * A case-list cell that opens a small menu on click, for changing the value
 * in place (staff, team, status). The menu is rendered in a portal pinned to
 * the cell rather than inside it: the list scrolls in a virtualised
 * `overflow-auto` container, which would otherwise clip it. It opens downward,
 * or above when there isn't room; Escape, a click elsewhere or scrolling
 * closes it.
 */
export function CellMenu({
  label,
  trigger,
  children,
  role = 'menu',
}: {
  /** What the menu changes, for screen readers ("Change status"). */
  label: string;
  /** What the cell shows (the current value). */
  trigger: ReactNode;
  /** The menu's contents; `close` closes it (after a single choice). */
  children: (close: () => void) => ReactNode;
  /** 'menu' for one choice; 'dialog' for several (ticking teams). */
  role?: 'menu' | 'dialog';
}) {
  const [pos, setPos] = useState<MenuPos | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = pos !== null;
  const close = () => {
    setPos(null);
    buttonRef.current?.focus();
  };

  const openMenu = () => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(r.left, window.innerWidth - MENU_WIDTH - 8),
    );
    const spaceBelow = window.innerHeight - r.bottom;
    if (spaceBelow < MENU_MAX_HEIGHT && r.top > spaceBelow) {
      setPos({ left, bottom: window.innerHeight - r.top + 4 });
    } else {
      setPos({ left, top: r.bottom + 4 });
    }
  };

  useEffect(() => {
    if (!open) return;
    // Move focus into the menu so it can be used from the keyboard.
    menuRef.current
      ?.querySelector<HTMLElement>('button, input')
      ?.focus({ preventScroll: true });
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t))
        return;
      setPos(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    // The cell can scroll away from a pinned menu; closing is the simplest,
    // least surprising behaviour. Capture catches the inner scroll container.
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setPos(null);
    };
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

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setPos(null) : openMenu())}
        aria-haspopup={role}
        aria-expanded={open}
        aria-label={label}
        className="max-w-full truncate rounded px-1 py-0.5 text-left text-sm hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role={role}
            aria-label={label}
            // Tabbing out closes it, as clicking elsewhere does.
            onBlur={(e) => {
              const to = e.relatedTarget as Node | null;
              if (
                to &&
                (menuRef.current?.contains(to) ||
                  buttonRef.current?.contains(to))
              )
                return;
              if (to) setPos(null);
            }}
            // Up and down move through the choices.
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
              const items = Array.from(
                menuRef.current?.querySelectorAll<HTMLElement>(
                  'button, input',
                ) ?? [],
              );
              const at = items.indexOf(document.activeElement as HTMLElement);
              const next =
                e.key === 'ArrowDown'
                  ? items[(at + 1) % items.length]
                  : items[(at - 1 + items.length) % items.length];
              e.preventDefault();
              next?.focus();
            }}
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
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  );
}

/** A heading inside a cell menu. */
export function MenuHeading({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </p>
  );
}

/** One choice in a cell menu; the current one is ticked. */
export function MenuChoice({
  children,
  current = false,
  onChoose,
}: {
  children: ReactNode;
  current?: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={current}
      onClick={onChoose}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50 focus:bg-gray-100 focus:outline-none ${
        current ? 'font-semibold text-resend-purple' : 'text-resend-ink'
      }`}
    >
      <span aria-hidden="true" className="w-3">
        {current ? '✓' : ''}
      </span>
      {children}
    </button>
  );
}
