import { OWNER_QUEUE_VALUES, type OwnerQueue } from '@re-send/shared';
import type { UserSummary } from '../../api/client';

type Target = { ownerUserId: string } | { ownerQueue: OwnerQueue };

export function BulkBar({
  count,
  users,
  onReassign,
  onClear,
}: {
  count: number;
  users: UserSummary[];
  onReassign: (target: Target) => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg bg-resend-purple px-4 py-2 text-white">
      <span className="text-sm font-medium">{count} selected</span>
      <label className="flex items-center gap-2 text-sm">
        <span className="sr-only">Reassign selected cases to</span>
        <select
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            if (v.startsWith('queue:'))
              onReassign({ ownerQueue: v.slice(6) as OwnerQueue });
            else onReassign({ ownerUserId: v });
            e.target.value = '';
          }}
          className="rounded-md border-0 bg-white/15 px-2 py-1 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <option value="" className="text-resend-ink">
            Reassign to…
          </option>
          {users.map((u) => (
            <option key={u.id} value={u.id} className="text-resend-ink">
              {u.displayName}
            </option>
          ))}
          {OWNER_QUEUE_VALUES.map((q) => (
            <option key={q} value={`queue:${q}`} className="text-resend-ink">
              Queue: {q}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto text-sm underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        Clear selection
      </button>
    </div>
  );
}
