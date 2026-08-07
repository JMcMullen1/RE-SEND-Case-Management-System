import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAccounts, fetchSession, logout, resetDemo } from '../../api/auth';

/**
 * The signed-in user, a sign-out control, and — in demo mode — a reset that
 * empties the case list so a walkthrough can be run again from scratch.
 */
export function SessionMenu() {
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ['session'], queryFn: fetchSession });
  const accounts = useQuery({
    queryKey: ['auth-accounts'],
    queryFn: fetchAccounts,
  });
  const demoMode = accounts.data?.demoMode ?? false;

  const signOut = useMutation({
    mutationFn: logout,
    // The server has cleared the session cookie. Invalidating the session query
    // isn't enough: React Query keeps the last successful data on a failed
    // background refetch, so the gate would never flip. Do a full navigation to
    // the root instead — it re-bootstraps against a 401 (dropping to the login
    // screen) and clears every cached query, so no case data lingers in memory.
    onSuccess: () => {
      window.location.assign('/');
    },
  });

  const reset = useMutation({
    mutationFn: resetDemo,
    // Reset empties every case-data table. Invalidate the whole cache so the
    // list, the calendar and any open case screen all refetch their now-blank
    // state, rather than showing stale rows.
    onSuccess: () => qc.invalidateQueries(),
  });

  if (!session.data) return null;

  return (
    <div className="flex items-center gap-3 text-xs text-gray-500">
      {demoMode && (
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                'Reset the demo? This empties every case back to a blank list.',
              )
            )
              reset.mutate();
          }}
          disabled={reset.isPending}
          className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:opacity-50"
        >
          {reset.isPending ? 'Resetting…' : 'Reset demo'}
        </button>
      )}
      <span className="text-gray-600">{session.data.displayName}</span>
      <button
        type="button"
        onClick={() => signOut.mutate()}
        className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        Sign out
      </button>
    </div>
  );
}
