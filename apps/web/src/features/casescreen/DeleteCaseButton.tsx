import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { deleteCase } from '../../api/client';

/**
 * Admin-only case deletion. Deleting a case is destructive, so it is guarded by
 * a modal that requires the admin to type the client's name exactly before the
 * Delete button enables — a deliberate, hard-to-do-by-accident action. The
 * server independently enforces the admin role and the same name match, so this
 * is a usability guard on top of a real one, not the only check. The delete is
 * soft and audited server-side.
 */
export function DeleteCaseButton({
  caseId,
  confirmName,
}: {
  caseId: string;
  confirmName: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const del = useMutation({
    mutationFn: () => deleteCase(caseId, typed.trim()),
    // The case is gone: navigate back to the list. A full navigation also
    // clears the cached case detail from memory.
    onSuccess: () => window.location.assign('/'),
  });

  const matches =
    typed.trim().length > 0 &&
    typed.trim().toLowerCase() === confirmName.trim().toLowerCase();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTyped('');
          del.reset();
          setOpen(true);
        }}
        className="rounded border border-status-amber px-2 py-1 text-xs font-medium text-status-amber hover:bg-status-amber hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-status-amber"
      >
        Delete case
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-case-title"
        >
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
            <h2
              id="delete-case-title"
              className="text-base font-semibold text-resend-ink"
            >
              Delete this case?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              This removes the case from every list. It is recoverable by an
              administrator and the deletion is recorded, but it should not be
              done lightly.
            </p>
            <p className="mt-3 text-sm text-gray-600">
              To confirm, type{' '}
              <span className="font-semibold text-resend-ink">
                {confirmName}
              </span>{' '}
              below.
            </p>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmName}
              aria-label="Type the name to confirm deletion"
              className="mt-2 w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            />
            {del.isError && (
              <p className="mt-2 text-sm text-status-amber" role="alert">
                {del.error instanceof Error
                  ? del.error.message
                  : 'Could not delete the case.'}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!matches || del.isPending}
                onClick={() => del.mutate()}
                className="rounded-md bg-status-amber px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-status-amber disabled:opacity-50"
              >
                {del.isPending ? 'Deleting…' : 'Delete case'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
