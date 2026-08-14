import type { ReactNode } from 'react';
import type { Status } from '@re-send/shared';

/** Neutral chip. Status chips are intentionally not colour-coded — the only
 * status colour in the interface is amber, reserved for "Unassigned". */
export function Chip({
  children,
  onRemove,
  removeLabel,
}: {
  children: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-resend-ink">
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? 'Remove filter'}
          className="rounded-full px-0.5 text-gray-500 hover:text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          ×
        </button>
      )}
    </span>
  );
}

export function StatusChip({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-medium text-resend-ink">
      {status}
    </span>
  );
}

/** The one place amber appears: an unassigned (queue-owned) case. Black on
 * amber clears WCAG AA (~6:1) far more safely than amber text on white. */
export function UnassignedChip({ queue }: { queue: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-status-amber px-2.5 py-0.5 text-xs font-semibold text-black">
      Unassigned · {queue}
    </span>
  );
}

/** A small downward caret marking a control as an opener for a dropdown menu. */
export function CaretDown() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="h-3 w-3 shrink-0 text-gray-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path
        d="M3 4.5 6 7.5 9 4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-4 w-4 shrink-0 text-gray-500 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
      aria-hidden="true"
    >
      <path
        d="M7 5l6 5-6 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
