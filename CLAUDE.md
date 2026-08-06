# RE-SEND Case Management System

Single tenant, single customer. No organisation table, no tenant scoping.
RE-SEND is an advice and advocacy charity supporting children with special
educational needs; this system holds special category personal data about
those children.

## Stack

- `apps/web` — React, TypeScript, Vite, Tailwind, TanStack Query, TanStack
  Router.
- `apps/api` — Node, TypeScript, Fastify, Zod validation on every request and
  response.
- `packages/shared` — Zod schemas, types, branding, configuration, pure domain
  logic. Imported by both apps as `@re-send/shared`.
- PostgreSQL via Drizzle ORM. SQL migrations are checked into
  `apps/api/migrations`.
- Vitest for unit tests, Playwright for end-to-end, ESLint, Prettier.
- GitHub Actions runs typecheck, lint, format and tests on every pull request.

## Invariants

These are enforced by tooling or review. Do not break them.

1. **Zod on every route, in and out.** Every Fastify route declares Zod schemas
   for its request and its response via the Zod type provider. No unvalidated
   body, query, params or reply anywhere in the API.

2. **No database access outside `apps/api/src/repositories`.** Only repository
   modules import the Drizzle client (`apps/api/src/db/client.ts`). Routes and
   services call repositories; they never touch the database directly.

3. **Brand values only in `branding.ts`.** `packages/shared/src/branding.ts` is
   the single home of hex colour values, the logo path, product name and
   strapline. The ESLint rule `branding/no-hex-color` fails the build on a hex
   literal in any other file. Reference the tokens or the emitted CSS custom
   properties (`--resend-purple`, `--resend-lilac`, `--resend-green`,
   `--resend-ink`, `--status-amber`).

4. **Vocabularies only in `config.ts`.** `packages/shared/src/config.ts` holds
   every controlled vocabulary (statuses, teams, query and work types, codes,
   school years, key date and document categories, consultation states) and
   every rule and threshold. Nothing else redeclares these lists.

5. **The staff list comes from the users table, never from config.** Joiners and
   leavers are an admin action, not a deploy. Any control that lists staff
   builds itself from active users.

6. **Personal data never reaches logs.** This system holds special category
   data about children. Do not log names, contact details, case content or any
   identifying data. Log identifiers and outcomes, not people.

7. **Every mutation is auditable.** State-changing operations record who did
   what and when. Do not add a mutation path that cannot be audited.

## Layout

```
apps/web/               React front end
apps/api/               Fastify API
  src/db/               Drizzle client and schema
  src/repositories/     the only database access
  migrations/           checked-in SQL migrations
packages/shared/        schemas, types, branding, config
```

## Commands

- `npm run check` — typecheck, lint, format check and unit tests. Must pass
  before every commit and is what CI runs.
- `npm run test` — Vitest unit tests. `npm run test:e2e` — Playwright.
- `npm run format` — apply Prettier.

## Commit convention

Conventional Commits: `type(scope): summary`, e.g.
`feat(api): add case repository`. Types: `feat`, `fix`, `chore`, `refactor`,
`test`, `docs`, `build`, `ci`. Keep the summary imperative and under ~72
characters. One logical change per commit; `npm run check` must pass first.
