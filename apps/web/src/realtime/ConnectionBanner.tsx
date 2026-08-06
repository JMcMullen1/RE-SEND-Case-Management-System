import { useConnectionStatus } from './RealtimeProvider';

/** Shown while the live channel is down, so nobody assumes their view is live. */
export function ConnectionBanner() {
  const status = useConnectionStatus();
  if (status !== 'disconnected') return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-status-amber bg-gray-50 px-4 py-1.5 text-xs text-resend-ink"
    >
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 rounded-full bg-status-amber"
      />
      Live updates paused — reconnecting. Your view may be out of date.
    </div>
  );
}
