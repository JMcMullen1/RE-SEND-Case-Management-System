import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { CaseListPage } from './features/caselist/CaseListPage';
import { CaseScreenPage } from './features/casescreen/CaseScreenPage';
import { NewCasePage } from './features/newcase/NewCasePage';
import { ReviewModePage } from './features/review/ReviewModePage';
import { CalendarPage } from './features/calendar/CalendarPage';
import { RatesPage } from './features/time/RatesPage';
import { TimePage } from './features/time/TimePage';
import { SchoolPage } from './features/schools/SchoolPage';
import { SchoolsPage } from './features/schools/SchoolsPage';
import { StaffPage } from './features/admin/StaffPage';
import { ImportPage } from './features/admin/ImportPage';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: CaseListPage,
});

const newCaseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cases/new',
  component: NewCasePage,
});

const caseScreenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cases/$caseId',
  component: CaseScreenPage,
});

const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/review',
  component: ReviewModePage,
});

const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/calendar',
  component: CalendarPage,
});

const timeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/time',
  component: TimePage,
});

const ratesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/rates',
  component: RatesPage,
});

const schoolsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/schools',
  component: SchoolsPage,
});

const schoolRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/schools/$schoolId',
  component: SchoolPage,
});

const staffRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/staff',
  component: StaffPage,
});

const importRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/import',
  component: ImportPage,
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
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
