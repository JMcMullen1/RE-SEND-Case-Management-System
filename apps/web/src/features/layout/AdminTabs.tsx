import { Link, useRouterState } from '@tanstack/react-router';

const TABS = [
  { to: '/admin/staff', label: 'Staff' },
  { to: '/admin/rates', label: 'Staff rates' },
  { to: '/admin/export', label: 'Full export' },
  { to: '/admin/restore', label: 'Full import' },
  { to: '/admin/import', label: 'Import the case list' },
  { to: '/admin/import-schools', label: 'Import schools' },
] as const;

/** The admin screens, side by side, so each is one click from the others. */
export function AdminTabs() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav aria-label="Admin" className="mt-3 overflow-x-auto">
      <ul className="flex gap-1">
        {TABS.map((t) => {
          const current = path === t.to;
          return (
            <li key={t.to}>
              <Link
                to={t.to}
                aria-current={current ? 'page' : undefined}
                className={`block whitespace-nowrap rounded-full px-3 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple ${
                  current
                    ? 'bg-resend-purple text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
