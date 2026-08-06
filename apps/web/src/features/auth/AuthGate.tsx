import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSession } from '../../api/auth';
import { LoginPage } from './LoginPage';

/**
 * Gate the whole app behind a session. While the session is resolving we show a
 * neutral splash; a 401 (or any failure to resolve) drops to the sign-in screen;
 * a resolved session renders the app. In non-demo development the API resolves a
 * fallback user, so the gate is transparent there.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: fetchSession,
    retry: false,
  });

  if (session.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  if (session.isError || !session.data) {
    return (
      <LoginPage
        onSignedIn={() => {
          void qc.invalidateQueries({ queryKey: ['session'] });
          void qc.invalidateQueries({ queryKey: ['me'] });
        }}
      />
    );
  }

  return <>{children}</>;
}
