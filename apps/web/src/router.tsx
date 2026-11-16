import { useEffect, useRef, type MouseEvent } from 'react';
import { PRODUCT_NAME } from '@re-send/shared';
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
// The case list loads with the app; every other screen loads when first opened.
import { CaseListPage } from './features/caselist/CaseListPage';
import { AppNav } from './features/layout/AppNav';

/**
 * Plain links to the app's own screens (`<a href="/schools/…">`) move within
 * the app instead of reloading the page: faster, and nothing already loaded is
 * fetched again. New-tab clicks, downloads, other sites and API files (document
 * downloads) are left to the browser.
 */
function navigateInApp(e: MouseEvent<HTMLElement>): void {
  if (e.defaultPrevented || e.button !== 0) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element).closest('a');
  if (!a || !a.href || a.hasAttribute('download')) return;
  if (a.target && a.target !== '_self') return;
  const url = new URL(a.href);
  // blob: download links report this origin too, so check the scheme.
  if (
    url.protocol !== window.location.protocol ||
    url.origin !== window.location.origin
  )
    return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/brand/'))
    return;
  e.preventDefault();
  void router.navigate({ href: `${url.pathname}${url.search}${url.hash}` });
}

/**
 * Every screen sits under the main navigation, in a scrolling region below it,
 * except review mode, which is deliberately full screen.
 */
/** The browser tab's name for a screen, so open tabs can be told apart. */
function screenTitle(path: string): string | null {
  if (path === '/') return 'Cases';
  if (path === '/cases/new') return 'Add a case';
  if (path.startsWith('/cases/')) return 'Case';
  if (path === '/review') return 'Review';
  if (path === '/calendar') return 'Calendar';
  if (path === '/time') return 'My Timesheet';
  if (path === '/admin/rates') return 'Staff rates';
  if (path === '/admin/staff') return 'Staff';
  if (path === '/admin/import') return 'Import the case list';
  if (path === '/admin/export') return 'Full export';
  if (path === '/admin/restore') return 'Full import';
  if (path === '/admin/import-schools') return 'Import schools';
  if (path.startsWith('/schools')) return 'Schools';
  if (path === '/search') return 'Search';
  if (path === '/emails') return 'Emails to file';
  return null;
}

function RootLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  // The screens scroll inside the region below the navigation, which stays in
  // place between screens: start each new screen at its top.
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    content.current?.scrollTo(0, 0);
  }, [path]);
  useEffect(() => {
    const title = screenTitle(path);
    // No names in the title: it shows in browser history and on shared screens.
    document.title = title ? `${title} · ${PRODUCT_NAME}` : PRODUCT_NAME;
  }, [path]);
  if (path === '/review')
    return (
      <div onClick={navigateInApp}>
        <Outlet />
      </div>
    );
  return (
    <div
      onClick={navigateInApp}
      className="flex h-dvh flex-col bg-white text-resend-ink"
    >
      <AppNav />
      <div ref={content} className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}

const rootRoute = createRootRoute({ component: RootLayout });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: CaseListPage,
});

const newCaseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cases/new',
  component: lazyRouteComponent(
    () => import('./features/newcase/NewCasePage'),
    'NewCasePage',
  ),
});

const caseScreenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cases/$caseId',
  component: lazyRouteComponent(
    () => import('./features/casescreen/CaseScreenPage'),
    'CaseScreenPage',
  ),
});

const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/review',
  component: lazyRouteComponent(
    () => import('./features/review/ReviewModePage'),
    'ReviewModePage',
  ),
});

const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/calendar',
  component: lazyRouteComponent(
    () => import('./features/calendar/CalendarPage'),
    'CalendarPage',
  ),
});

const timeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/time',
  component: lazyRouteComponent(
    () => import('./features/time/TimePage'),
    'TimePage',
  ),
});

const ratesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/rates',
  component: lazyRouteComponent(
    () => import('./features/time/RatesPage'),
    'RatesPage',
  ),
});

const schoolsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/schools',
  component: lazyRouteComponent(
    () => import('./features/schools/SchoolsPage'),
    'SchoolsPage',
  ),
});

const schoolRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/schools/$schoolId',
  component: lazyRouteComponent(
    () => import('./features/schools/SchoolPage'),
    'SchoolPage',
  ),
});

const staffRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/staff',
  component: lazyRouteComponent(
    () => import('./features/admin/StaffPage'),
    'StaffPage',
  ),
});

const importRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/import',
  component: lazyRouteComponent(
    () => import('./features/admin/ImportPage'),
    'ImportPage',
  ),
});

const exportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/export',
  component: lazyRouteComponent(
    () => import('./features/admin/ExportPage'),
    'ExportPage',
  ),
});

const restoreRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/restore',
  component: lazyRouteComponent(
    () => import('./features/admin/RestorePage'),
    'RestorePage',
  ),
});

const schoolImportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/import-schools',
  component: lazyRouteComponent(
    () => import('./features/admin/SchoolImportPage'),
    'SchoolImportPage',
  ),
});

const emailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/emails',
  component: lazyRouteComponent(
    () => import('./features/emails/EmailsToFilePage'),
    'EmailsToFilePage',
  ),
});

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/search',
  component: lazyRouteComponent(
    () => import('./features/search/SearchPage'),
    'SearchPage',
  ),
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  newCaseRoute,
  caseScreenRoute,
  reviewRoute,
  calendarRoute,
  timeRoute,
  ratesRoute,
  schoolsRoute,
  schoolRoute,
  staffRoute,
  importRoute,
  schoolImportRoute,
  exportRoute,
  restoreRoute,
  searchRoute,
  emailsRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
