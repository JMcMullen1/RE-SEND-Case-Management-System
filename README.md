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
  case, enquiry route → query type); school year, DSPL area and enquiry method
  are derived, not extracted.
- Prefilled fields are marked as machine-filled; low-confidence fields are
  flagged and focused first, and editing a field clears its marking.
- On Create, the original submission is attached to the new case as a document
  and any implied key dates are recorded.
- The model is **Claude Haiku 4.5**, configurable per job. An evaluation set of
  ten anonymised submissions lives in `apps/api/src/ai/eval/intake` — run it with
  `RUN_INTAKE_EVAL=1` and an API key to revisit the model choice on evidence.
- `AI_ENABLED` (or the per-job flag) switches smart fill off cleanly; the manual
  form stays fully usable.

### Render free tier

**Render's free tier spins services down after inactivity.** A spun-down
service drops all WebSocket connections and stops holding the `LISTEN`
connection, so live updates — and this feature as a whole — break until the
service is woken by the next HTTP request (which also incurs a cold start).
Run the API on a paid, always-on instance for live updates to hold.
