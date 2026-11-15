import { Link, useRouterState } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LOGO_PATH, PRODUCT_NAME } from '@re-send/shared';
import { getActingUserId, setActingUserId } from '../../api/client';
import { fetchAccounts } from '../../api/auth';
import { fetchInboxCount } from '../../api/email-inbox';
import { useMe, useUsers } from '../../hooks/useCaseData';
import { SessionMenu } from '../auth/SessionMenu';

interface NavItem {
  to: string;
  label: string;
  /** Also current on these paths (e.g. a case is part of Cases). */
  matches: (path: string) => boolean;
  adminOnly?: boolean;
  /** Shows how many emails are waiting to be filed. */
  countsWaiting?: boolean;
}

const NAV: NavItem[] = [
  {
    to: '/',
    label: 'Cases',
    matches: (p) => p === '/' || p.startsWith('/cases'),
  },
  {
    to: '/calendar',
    label: 'Calendar',
    matches: (p) => p.startsWith('/calendar'),
  },
  {
    to: '/schools',
    label: 'Schools',
    matches: (p) => p.startsWith('/schools'),
  },
  { to: '/search', label: 'Search', matches: (p) => p.startsWith('/search') },
  {
    to: '/emails',
    label: 'Emails',
    matches: (p) => p.startsWith('/emails'),
    countsWaiting: true,
  },
  { to: '/time', label: 'My time', matches: (p) => p.startsWith('/time') },
  {
    to: '/admin/staff',
    label: 'Admin',
    matches: (p) => p.startsWith('/admin'),
    adminOnly: true,
  },
];

/**
 * Local development only (no sign-in): act as another member of staff. Where
 * sign-in is enforced the API ignores this, so it is never shown there.
 */
function DevUserSwitcher() {
  const qc = useQueryClient();
  const users = useUsers().data?.users ?? [];
  const accounts = useQuery({
    queryKey: ['auth-accounts'],
    queryFn: fetchAccounts,
    enabled: import.meta.env.DEV,
  });
  if (!import.meta.env.DEV || accounts.data?.demoMode !== false) return null;
  if (users.length === 0) return null;
  return (
    <label className="hidden items-center text-xs text-gray-500 md:flex">
      <span className="sr-only">Acting as user (development only)</span>
      <select
        defaultValue={getActingUserId() ?? ''}
        onChange={(e) => {
          setActingUserId(e.target.value || null);
          void qc.invalidateQueries();
        }}
        className="rounded border border-dashed border-gray-300 bg-white px-1 py-0.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        <option value="">Acting as… (dev)</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The bar across the top of every screen: the brand, the main sections (the
 * current one marked), and who is signed in. On a phone the sections scroll
 * sideways under the brand rather than wrapping.
 */
export function AppNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = useMe().data?.role === 'admin';
  const items = NAV.filter((i) => !i.adminOnly || isAdmin);
  const waiting =
    useQuery({
      queryKey: ['email-inbox', 'count'],
      queryFn: fetchInboxCount,
      refetchInterval: 5 * 60_000,
    }).data?.count ?? 0;

  return (
    <header className="shrink-0 border-b border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 sm:px-6">
        <Link
          to="/"
          className="flex h-14 items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          <img
            src={LOGO_PATH}
            alt=""
            aria-hidden="true"
            className="h-9 w-9 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <span className="text-base font-semibold text-resend-purple">
            {PRODUCT_NAME}
          </span>
        </Link>
        <nav
          aria-label="Main"
          className="order-last -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 sm:order-none sm:mx-0 sm:w-auto sm:flex-1 sm:px-0"
        >
          <ul className="flex gap-1">
            {items.map((item) => {
              const current = item.matches(path);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={current ? 'page' : undefined}
                    className={`relative flex h-11 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple sm:h-14 ${
                      current
                        ? 'text-resend-purple after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-resend-purple'
                        : 'text-gray-600 hover:text-resend-ink'
                    }`}
                  >
                    {item.label}
                    {item.countsWaiting && waiting > 0 && (
                      <span className="ml-1.5 rounded-full bg-resend-purple px-1.5 text-xs font-semibold leading-5 text-white">
                        {waiting}
                        <span className="sr-only"> waiting to be filed</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <DevUserSwitcher />
          <SessionMenu />
        </div>
      </div>
    </header>
  );
}
