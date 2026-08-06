# RE-SEND Case Management System

Single-tenant case management for RE-SEND, an advice and advocacy charity
supporting children with special educational needs. See `CLAUDE.md` for the
stack, invariants and conventions.

## Development

```
npm install
npm run check          # typecheck, lint, format check, unit tests
npm run test:e2e       # Playwright
```

Database (PostgreSQL via Drizzle):

```
npm run db:migrate -w @re-send/api     # apply checked-in SQL migrations
DATABASE_URL=... NODE_ENV=development npm run fixtures:load   # dev data only
```

## Live updates

The app updates live for every signed-in user so nobody works from a stale
view.

- A **generic** Postgres trigger function (`notify_entity_change`) emits a
  `NOTIFY` on the `entity_change` channel carrying the table name, row id and,
  for rows that belong to a case, the owning case id. Adding a table to live
  updates is **one `CREATE TRIGGER` line** in a migration — the function is
  never duplicated. It is applied to `cases`, `case_notes`, `key_dates`,
  `case_reviews` and `documents`; `emails` and `time_entries` are registered as
  inert entries in the API registry.
- The API holds a **single `LISTEN` connection** and fans each notification out
  over WebSockets, mapping entity type to the affected TanStack Query keys
  through a registry. Because the notification originates in Postgres, this
  works unchanged with **more than one API instance**: every instance listens
  and forwards to its own clients. (Presence — who else has a case open — is
  tracked per instance; a multi-instance deployment would share it through the
  same channel or a cache.)
- The client keeps one WebSocket, invalidates the **precise** query keys it is
  told about, reconnects with **exponential backoff**, and on reconnect
  **refetches** rather than trusting the cache. A small banner shows while the
  channel is down so users know the live guarantee is suspended.

## Documents and storage

Document bytes go through a `StorageProvider` (`apps/api/src/storage`) — nothing
outside that module knows where they live.

- `STORAGE_PROVIDER=local` (default) writes under `UPLOAD_DIR`; `STORAGE_PROVIDER=s3`
  talks to any S3-compatible endpoint (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`), signing with
  SigV4 and no SDK dependency. Validate the S3 provider against the target
  endpoint before trusting it in production.
- Object keys are **UUID-based and carry no personal data**; the real filename
  lives only in the database. Downloads and previews are proxied through the
  **audited** API content route, so storage URLs never reach the browser.
- On upload the bytes are SHA-256'd (a byte-identical re-file on the same case is
  reported as a **duplicate**, not stored twice), same-filename changes create a
  **new version** with full history, and text is extracted (PDF, DOCX, plain
  text) into `extracted_text` for the corpus and full-text search.
- Uploads are multipart to the API for now. The one swap point for
  direct-to-storage **pre-signed** uploads is marked `PRESIGNED-UPLOAD SWAP
POINT` in `apps/web/src/api/documents.ts` and the S3 provider.

## Case corpus

`caseCorpus(caseId, options)` (`apps/api/src/corpus`) is the single reading
surface for AI features — even one that needs a single document reads through it.
It returns an ordered set of text items (`case_record`, `document`, `note` today;
`email` and `time_entry` registered-empty), each with a stable id a model can
cite. Superseded document versions and soft-deleted rows are excluded
**explicitly** (reported in `excluded`, not dropped silently). It serialises to a
delimited string carrying item ids, reports an estimated token count, takes a
`select` option, and is cached per case — invalidated whenever a constituent row
changes, driven by the same Postgres `NOTIFY` as live updates.

## AI job layer

Every Claude API call goes through one module, `apps/api/src/ai` — there is never
more than one set of conventions.

- **Server-side only.** The `ANTHROPIC_API_KEY` lives in the environment and
  never reaches the browser.
- **`runAiJob(definition, input)`.** A definition names the job, its model, a Zod
  output schema, the system prompt, whether to use prompt caching (and at what
  TTL), and a token budget. Moving a job between models is a config change, not a
  code change.
- **Structured by construction.** The output schema becomes a tool the model is
  forced to call, so the result is structurally guaranteed rather than parsed out
  of prose.
- **Accounted.** Every run writes to `ai_job_runs` — job, model, input/output and
  cache token counts, latency, outcome, estimated cost — and **never** the prompt
  or the response, both of which carry special category data about a child. Spend
  per job type over time reads from the `ai_spend_by_job` view (`GET /api/ai/spend`).
- **Resilient.** Transient failures (429/5xx/network) retry with exponential
  backoff; a hard failure throws (never returns empty), and a refusal surfaces
  as an error rather than a silent blank.
- **Switchable without a deploy.** `AI_ENABLED` is a global kill switch; per-job
  flags live in `ai_job_flags` and toggle at runtime (`GET`/`POST /api/ai/flags`).
- **Prompt caching** is wired with a selectable TTL but off by default.

## Smart fill (JotForm intake)

The add-case form can be prefilled from a JotForm submission (PDF, DOCX, HTML,
`.eml`) or a plain enquiry email, dropped, chosen, or pasted.

- It is **not a second creation path**: it prefills the _same_ form, and the same
  review, duplicate detection and Create logic apply. Nothing is written to the
  database until the user presses Create.
- The pipeline stores the upload through the storage provider (not as a text
  blob), extracts text server-side (never page images — a labelled text form
  gains nothing from them at ~10x the input tokens), reads it through the corpus
  as a single-document selection, then runs the `extract_intake` AI job.
- Every field comes back with a confidence, or null with a reason — never a
  guess. Extracted values map onto the config vocabularies (service → type of
  case, enquiry route → query type); school year and enquiry method are
  derived, not extracted.
- Prefilled fields are marked as machine-filled; low-confidence fields are
  flagged and focused first, and editing a field clears its marking.
- On Create, the original submission is attached to the new case as a document
  and any implied key dates are recorded.
- The model is **Claude Haiku 4.5**, configurable per job. An evaluation set of
  ten anonymised submissions lives in `apps/api/src/ai/eval/intake` — run it with
  `RUN_INTAKE_EVAL=1` and an API key to revisit the model choice on evidence.
- `AI_ENABLED` (or the per-job flag) switches smart fill off cleanly; the manual
  form stays fully usable.

## Directions-order ingestion

A tribunal directions order (PDF or DOCX) dropped on a case is turned into a
reviewed set of calendar changes. The human confirmation step is the feature.

- **Working days.** `packages/shared/working-days.ts` does England & Wales
  working-day arithmetic — days between, add/subtract, and resolving written
  deadlines ("within 14 days of the date of this order", "no later than 4pm 10
  working days before the hearing"). Every function returns a human-readable
  explanation alongside its result so a caseworker can check the arithmetic.
  Bank holidays come from the GOV.UK feed, cached, with a **checked-in snapshot**
  (`bank-holidays-snapshot.ts`) as a fallback so a feed outage cannot break a
  deadline calculation.
- **Extraction.** The order is stored as a `Tribunal Order` document, its text is
  extracted (paragraph numbering preserved — directions are cited by number),
  and the `extract_directions` job (**Claude Sonnet 5**) returns one entry per
  obligation: who it falls on, the deadline, the raw date text as written,
  whether it was expressed in working days, the source paragraph, and a
  confidence. Relative deadlines are then **recomputed** with the working-day
  utility rather than trusted from the model, carrying the explanation through.
- **Diff, not duplicate.** The resolved dates are diffed against the case's live
  key dates and classified `new`, `moved`, `superseded` or `unchanged`
  (`diffDirections`). The review screen shows old and new side by side, quotes
  the source paragraph, and lets every row be edited and individually included,
  under a plain summary ("3 new dates, 2 dates moved, 1 removed").
- **Apply once.** Nothing touches the calendar until _Apply changes_. On apply,
  the changes are written in one transaction under **one** audit entry; each key
  date is stamped with its `source_document_id` and `source_reference`. A moved
  or vacated date is marked **superseded, never deleted**, so the case file shows
  how the timetable evolved. An amended order therefore updates the timetable in
  place — it never lays a second parallel set of dates beside the first.
- `AI_ENABLED` (or the per-job flag) switches extraction off cleanly; the order
  is still filed as a document and key dates can be entered by hand.

## Shared calendar

Every case's key dates on one calendar (`/calendar`, `apps/web/src/features/calendar`).

- **Views.** Agenda (the default — deadline work is a list before it is a grid),
  week and month. The pure date maths (week/month bounds, the Monday–Sunday
  month grid, day grouping) lives in `packages/shared/calendar.ts` and is tested
  directly.
- **Colour-coded by type.** Each key-date type has a fixed colour. The values
  live only in `branding.ts` (emitted as `--kd-*` custom properties); the
  type→colour binding is `KEY_DATE_TYPE_COLOR_VAR` in `config.ts`. Entries show
  the case reference and the child's preferred name.
- **Filters.** My dates, all staff, a named person, team, key-date type and case
  status. Superseded entries are hidden by default, with a “show timetable
  history” toggle.
- **Live.** The calendar refreshes on the same Postgres `NOTIFY` → WebSocket
  channel as the case list — the `key_dates` registry entry invalidates
  `['calendar']`.
- **Edit in place.** Click an entry to open its case, or edit/delete it; add key
  dates against any case (a typeahead picks the case). Date fields are
  working-day aware — they flag weekends and England & Wales bank holidays and
  offer to nudge to the next working day, using the utility from directions
  ingestion. Bank holidays are served at `GET /api/bank-holidays` (feed, snapshot
  fallback).
- **iCal feed.** Each user has a token-authenticated read-only feed
  (`GET /api/calendar/feed/:token.ics`) so key dates reach a phone with no
  Microsoft integration. The token lives on `users.ical_token`, is issued lazily
  and can be reset to revoke the old URL. The feed is a pure projection
  (`buildICalendar`) with stable per-key-date UIDs (`keydate-<id>@resend-cms`),
  so two-way Microsoft Graph sync can be added later as a separate id/etag
  mapping over the same projection — without unpicking the feed.

## Deployment and demo

`render.yaml` is a Render blueprint defining **one web service** and **managed
PostgreSQL**, on **paid, always-on** instances (the free tier spins down, which
breaks WebSockets and live updates).

- **One origin.** The API also serves the built front end (`apps/web/dist`) from
  its root (`@fastify/static`, with an `index.html` fallback for client-side
  routes), so the browser talks to a single host — the session cookie and the
  live-updates WebSocket need no cross-origin handling (no CORS, no hard-coded
  API URL). In development Vite serves the front end instead (no `dist` present),
  and the static handler is skipped.
- **Migrations run pre-deploy**, never on boot (`preDeployCommand`), so a new
  version reaches a migrated database before it serves traffic.
- **Readiness, not just liveness.** `GET /health/ready` checks the database is
  reachable (`SELECT 1`); it is Render's health check. `GET /health` is bare
  liveness.
- **Secrets** are named — never valued — in `.env.example`: `ANTHROPIC_API_KEY`,
  `SESSION_SECRET`, `DATABASE_URL`, `ENCRYPTION_KEY` and the storage credentials.
- **Security.** Helmet sets the security headers on every response, the served
  front end included; the CSP has **`script-src 'self'` with no `unsafe-inline`**
  (the XSS-critical directive), `connect-src 'self'`, and HSTS. Rate limiting is
  applied to the auth, upload and AI endpoints.
- **Structured JSON logging** with a request id on every line, through a
  **redaction layer** (`apps/api/src/logging`) that strips anything resembling
  an email, phone number, postcode or date of birth before a line is written —
  tested with a fixture carrying all four.
- **Backups & recovery.** Paid Render PostgreSQL takes a **daily backup** with
  point-in-time recovery. The restore procedure — executed once against a
  scratch database to prove it — is in `docs/disaster-recovery.md`.

### Demo mode

`DEMO_MODE=true` enables **local password login** for a small set of named
accounts (`apps/api/src/auth/demo-accounts.ts`), so the system can be shown
without a Microsoft tenant. It is refused under `NODE_ENV=production` (startup
fails). The deployed system starts with an **empty case list** — nothing is
seeded. `docs/demo/` holds a realistic JotForm PDF and an amended directions
order so cases are created live during a walkthrough. **Reset demo** (or
`npm run demo:reset -w @re-send/api`, DEMO_MODE only) empties every case-data
table back to a blank list so the walkthrough can be run again.

### End-to-end and accessibility

`apps/web/playwright.e2e.config.ts` runs the full journey against a real API and
a clean, empty database: sign in, see the empty state, add a case, create a
second by dropping a JotForm, apply a directions order and confirm the diff, see
the date on the calendar, run review mode, and reassign a case while a second
browser session watches it update live. **axe-core** scans the key screens and
the build fails on any serious or critical violation. Both run in CI
(`.github/workflows/ci.yml`) against a PostgreSQL service.

### Render free tier

**Render's free tier spins services down after inactivity.** A spun-down
service drops all WebSocket connections and stops holding the `LISTEN`
connection, so live updates — and this feature as a whole — break until the
service is woken by the next HTTP request (which also incurs a cold start).
Run the API on a paid, always-on instance for live updates to hold.
