import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PRODUCT_NAME, STRAPLINE } from '@re-send/shared';
import { fetchAccounts, login } from '../../api/auth';

/**
 * The sign-in screen. Under DEMO_MODE it offers the named demo accounts so the
 * system can be shown without a Microsoft tenant; the password is supplied by
 * whoever runs the demo. Off-demo it explains that single sign-on is required.
 */
export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const accountsQuery = useQuery({
    queryKey: ['auth-accounts'],
    queryFn: fetchAccounts,
  });
  const demoMode = accountsQuery.data?.demoMode ?? false;
  const accounts = accountsQuery.data?.accounts ?? [];

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // The account actually shown in the dropdown: the user's choice once made,
  // otherwise the first account. `email` stays '' until the select fires, so the
  // request must send this, not the raw state, or the default account posts an
  // empty email.
  const selectedEmail = email || accounts[0]?.email || '';

  const signIn = useMutation({
    mutationFn: () => login(selectedEmail, password),
    onSuccess: onSignedIn,
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-resend-purple">
          {PRODUCT_NAME}
        </h1>
        <p className="text-xs text-gray-500">{STRAPLINE}</p>

        {!demoMode ? (
          <p className="mt-6 text-sm text-gray-600">
            Sign in with your organisation account. Single sign-on is required —
            local password login is available only in demonstration mode.
          </p>
        ) : (
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              signIn.mutate();
            }}
          >
            <div>
              <label
                htmlFor="login-account"
                className="block text-xs font-medium text-gray-600"
              >
                Account
              </label>
              <select
                id="login-account"
                value={selectedEmail}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              >
                {accounts.map((a) => (
                  <option key={a.email} value={a.email}>
                    {a.displayName} ({a.email})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-medium text-gray-600"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              />
            </div>

            {signIn.isError && (
              <p className="text-sm text-status-amber" role="alert">
                {signIn.error instanceof Error
                  ? signIn.error.message
                  : 'Sign in failed.'}
              </p>
            )}

            <button
              type="submit"
              disabled={signIn.isPending || !selectedEmail || !password}
              className="w-full rounded-md bg-resend-purple px-4 py-2 text-sm font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:opacity-50"
            >
              {signIn.isPending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
