import type { PresenceUser } from '../../realtime/RealtimeProvider';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** Who else has this case open right now. */
export function PresenceIndicator({ users }: { users: PresenceUser[] }) {
  if (users.length === 0) return null;
  return (
    <div
      className="flex items-center gap-1.5"
      aria-label={`Also viewing: ${users.map((u) => u.displayName).join(', ')}`}
    >
      <span className="flex -space-x-1.5">
        {users.slice(0, 4).map((u) => (
          <span
            key={u.userId}
            title={u.displayName}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-white bg-resend-lilac text-[10px] font-semibold text-white"
          >
            {initials(u.displayName)}
          </span>
        ))}
      </span>
      <span className="text-xs text-gray-500">
        {users.length === 1
          ? '1 other viewing'
          : `${users.length} others viewing`}
      </span>
    </div>
  );
}
