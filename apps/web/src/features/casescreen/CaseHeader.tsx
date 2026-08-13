import { useEffect, useRef, useState } from 'react';
import {
  OWNER_QUEUE_VALUES,
  STATUS_VALUES,
  type CaseDetail,
  type OwnerQueue,
  type Status,
} from '@re-send/shared';
import type { UserSummary } from '../../api/client';
import { UnassignedChip } from '../caselist/primitives';
import type { useCaseMutations } from '../../hooks/useCaseScreen';

type Mutations = ReturnType<typeof useCaseMutations>;
type Target = { ownerUserId: string } | { ownerQueue: OwnerQueue };

export function CaseHeader({
  detail,
  users,
  mutations,
  onUploadDirections,
  directionsBusy,
}: {
  detail: CaseDetail;
  users: UserSummary[];
  mutations: Mutations;
  onUploadDirections: (file: File) => void;
  directionsBusy: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const childName = detail.child?.preferredName ?? detail.child?.fullName ?? '';

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <a href="/" className="text-sm text-resend-purple hover:underline">
        ← Cases
      </a>
      <div className="mr-auto">
        <h1 className="text-xl font-semibold text-resend-ink">
          {detail.client?.displayName ?? 'Unnamed client'}
          {childName && (
            <span className="font-normal text-gray-500"> · {childName}</span>
          )}
        </h1>
        <p className="text-xs text-gray-500">
          {detail.caseReference}
          {detail.appealNumber && ` · ${detail.appealNumber}`}
          {detail.team.length > 0 && ` · ${detail.team.join(', ')}`}
        </p>
      </div>

      <Reassign
        detail={detail}
        users={users}
        onReassign={(target) => mutations.reassign.mutate(target)}
      />

      <label className="flex items-center gap-1 text-sm text-gray-600">
        <span className="sr-only">Status</span>
        <select
          value={detail.status}
          onChange={(e) =>
            mutations.patchCase.mutate({ status: e.target.value as Status })
          }
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          aria-label="Change status"
        >
          {STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={directionsBusy}
        className="rounded-md border border-gray-200 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:opacity-50"
      >
        {directionsBusy ? 'Reading order…' : 'Upload directions'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUploadDirections(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function Reassign({
  detail,
  users,
  onReassign,
}: {
  detail: CaseDetail;
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
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (target: Target) => {
    setOpen(false);
    onReassign(target);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        {detail.owner.kind === 'user' ? (
          <span className="text-resend-ink">{detail.owner.displayName}</span>
        ) : (
          <UnassignedChip queue={detail.owner.queue ?? 'Enquiries'} />
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 max-h-72 w-56 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-gray-400">
            Assign to
          </p>
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              role="menuitem"
              onClick={() => choose({ ownerUserId: u.id })}
              className="block w-full px-3 py-1.5 text-left text-sm text-resend-ink hover:bg-gray-50"
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
              className="block w-full px-3 py-1.5 text-left text-sm text-resend-ink hover:bg-gray-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
