import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { CaseListPage } from './features/caselist/CaseListPage';
import { CaseScreenPage } from './features/casescreen/CaseScreenPage';
import { NewCasePage } from './features/newcase/NewCasePage';

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

const routeTree = rootRoute.addChildren([
  homeRoute,
  newCaseRoute,
  caseScreenRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
