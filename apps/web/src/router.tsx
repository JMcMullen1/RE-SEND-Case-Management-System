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

const routeTree = rootRoute.addChildren([
  homeRoute,
  newCaseRoute,
  caseScreenRoute,
  reviewRoute,
  calendarRoute,
  timeRoute,
  ratesRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
