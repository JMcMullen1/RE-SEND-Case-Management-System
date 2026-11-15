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

## Navigation and loading

Every screen sits under one navigation bar (`apps/web/src/features/layout/AppNav.tsx`),
rendered by the root route; review mode is deliberately full screen without it.
Links to the app's own screens move within the app rather than reloading the
page (`navigateInApp` in `apps/web/src/router.tsx`); downloads, new-tab links
and `/api/` files are left to the browser. The case list loads with the app and
every other screen loads its code when first opened; React, TanStack and Zod
are separate long-cached files, so a deploy only re-downloads what changed. The
browser tab names the screen (never a person).

## Live updates

The app updates live for every signed-in user so nobody works from a stale
view.

- A **generic** Postgres trigger function (`notify_entity_change`) emits a
  `NOTIFY` on the `entity_change` channel carrying the table name, row id and,
  for rows that belong to a case, the owning case id. Adding a table to live
  updates is **one `CREATE TRIGGER` line** in a migration — the function is
  never duplicated. It is applied to `cases`, `case_notes`, `key_dates`,
  `case_reviews`, `documents`, `emails`, `time_entries`, `schools`,
  `school_contacts`, `case_schools` and `drafts`.
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

## Case history

The **History** tab on a case reads it start to finish: its case notes and
billables, the emails filed to it and its documents, in date order and
grouped by day (`packages/shared/src/case-history.ts`,
`apps/web/src/features/casescreen/HistoryRegion.tsx`).

- **Each entry as it is:** a note or billable with its author and time; an
  email with its direction, time, sender and recipients, subject and body
  (a long one opens in full on request) and its attachments; a document with
  its folder, who uploaded it and which version.
- **Dated as it happened.** Every document appears on the day it was
  uploaded; one that also came as an email's attachment says which email (the
  same file can arrive first by upload and later by email). Emails are dated
  when sent; a note written on a later day than it is about sits at the end
  of its day. All in UK time.
- **Narrow it down:** by kind (case notes, billables, emails, documents),
  by words (in notes, emails including copied-in addresses, attachment names
  and document names), and newest or oldest first.
- **Always current:** it is built from the lists the case screen already
  holds, so it updates live like them. Notes are still written on their own
  tabs.

## Search inside documents and emails

**Search documents** on the case list searches every case; each case's
Documents / Emails tab has a search box for that case alone
(`apps/api/src/repositories/search.ts`, `apps/web/src/features/search`).

- **What is searched:** the text extracted from every document, and each
  filed email's subject, sender and body. Postgres full-text search with
  English stemming, so "assess" finds "assessment" and "assessed"; a phrase in
  quotes, OR and -word work as in a web search. A document's name, and an
  email's subject, count for more than its text.
- **What is shown:** the best 50 matches (and how many in all), each with its
  folder or sender, date, case, and a snippet with the matched words
  highlighted — rendered as plain text, never markup from a file. Documents
  open in a new tab (through the audited content route); a result's case link
  opens the case on its Documents / Emails tab.
- **Left out:** deleted documents and cases; earlier versions (unless asked
  for); and the original file of a filed email (its text is the email's).
  Filter by folder, or by documents or emails only.
- **Private and audited.** The words searched for travel in a POST body. In
  any case, query strings never reach the logs: the request log records paths
  only, the redaction layer strips the query string from any URL in any line
  (framework messages included), and a request that fails validation is logged
  without the value sent. Each search is audited with its scope and
  result count — never the words.
- **Long documents.** Each document and email is indexed up to its first
  300,000 characters (about 100 pages), or 150,000 for text in scripts with
  4-byte characters (`SEARCH_INDEXED_CHARS`, applied by the database function
  `resend_search_text`). The search vectors are stored on each row (migration
  0018), so ranking never re-reads a document. Snippets are written from the
  first 100,000 characters; a match further in still counts, and its snippet
  shows the opening words. This also fixed a bug: the earlier index covered the
  whole text, and Postgres refuses a search vector over 1 MB, so a very long
  document with many distinct words could not be uploaded at all.
- **The data export** leaves out the stored search vectors (generated, not
  records).

## Case corpus

`caseCorpus(caseId, options)` (`apps/api/src/corpus`) is the single reading
surface for AI features — even one that needs a single document reads through it.
It returns an ordered set of text items (`case_record`, `document`, `note` and
`email` today; `time_entry` registered-empty), each with a stable id a model can
cite. Superseded document versions, soft-deleted rows and the raw file behind a
filed email (read as its `email` item instead) are excluded **explicitly**
(reported in `excluded`, not dropped silently). It serialises to a
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

## Staff administration and data export

Admins manage staff and take the charity's data with them at any time
(`/admin/staff`, `apps/api/src/repositories/staff.ts`, `apps/api/src/export`).

- **Joiners, roles and leavers are an admin action, not a deploy.** An admin
  adds a person (name, work email used to sign in, role), changes their name,
  email or role, marks them as having left, or brings them back. Every staff
  picker builds from the users table, so changes show everywhere at once.
- **Leavers.** Marking someone as left signs them out on their next request
  (the session gate checks the account is active), closes their live-update
  connections, stops their calendar feed, and drops them from staff lists; their notes, time and approvals stay attributed to them. Their open
  cases (any status but Closed) can be handed to a queue or a colleague in the
  same step (only to caseworkers or admins) — each reassignment audited — and
  they are cleared as dealing shadow on open cases.
- **Rules.** There is always at least one active admin; an admin cannot remove
  their own admin access or mark themselves as left. Every change is audited.
- **Demo sign-in** lists active users from the database, so staff an admin adds
  can sign in; a restart only fills in missing demo accounts and never undoes
  an admin's changes. **Reset demo** puts the named demo staff back as listed
  (the demo password is shared, so a visitor's changes must be undoable).
- **Full data export.** One ZIP: a README, every table as CSV (UTF-8, ISO
  dates, deleted rows included) and every stored document by case reference,
  earlier versions marked. Only each person's calendar-feed token is withheld
  (a credential). Text a spreadsheet would run as a formula is defused. A
  MANIFEST written last lists row counts and any file missing from storage.
  Streamed with backpressure (tables a page at a time, documents in slices,
  stopping if the download is abandoned); admin-only, rate-limited; the start
  and the outcome of each export are audited. A test fails if a new table is
  not added to the export.

## Importing the existing case list

The one-off migration of the charity's case list spreadsheet (`/admin/import`,
admins only; `packages/shared/src/case-import.ts`,
`apps/api/src/repositories/case-import.ts`).

- **The file stays on the computer.** The Excel workbook (.xlsx) is read in the
  browser (`read-excel-file`); only its rows are sent to be checked, and only
  the cases imported are saved. If it has several sheets, one is chosen.
- **Columns are matched to the system's own headings** (`CASE_IMPORT_FIELDS`
  in `config.ts`, which also lists alternative headings): Date of enquiry,
  Allocated to, Dealing/ Shadow, Current Team, Status, Client Name, Email,
  Child's Name, Original Query, Method of enquiry, Current Work, Notes, Payment
  Details, Discount Code, Invoice Status, the contact and address columns and
  QB Notes. Any match can be changed, or a column left out.
- **Values are matched like a person would**, ignoring case, spacing and
  punctuation ("Section BF&I" is "Section B F & I"). Staff are matched from the
  users table by full name or a first name only one person has; "TSA Team" and
  "Enquiries" are queues. Anything not recognised is listed once under
  "Values to match" for an admin to choose what it means, for every row at once.
- **Every row is checked before anything is saved**: to import, already there
  (a case for the same client — as matched, not as spelled — child and date of
  enquiry, on the system or earlier in the sheet — so importing a corrected
  file again only adds what is new), or needs fixing (no date of enquiry or one
  in the future, an unknown status, nobody named, an email clash). Two-digit
  years are read as this century up to this year (98 is 1998).
  Blank rows are skipped; row numbers are the spreadsheet's own.
- **Families are never joined by guesswork.** A row joins an existing client
  on the same email and name, or on the same name and postcode when the two do
  not have different emails; siblings in the sheet share one new client the
  same way. One email given for two different names (a school's or a
  professional's address, say) is a problem to fix in the sheet, never a join.
  A name alone makes a separate record and says so.
- **Simple and advanced views**, as in the case list: the simple view shows the
  essentials; the advanced view shows every column. "More" on a row shows what
  to look at and each value as written and as it will be imported. Rows can be
  filtered by outcome.
- **Importing.** The import must be of exactly the list and matches checked (a
  fingerprint of both), is checked again, and runs in one transaction — all of
  it or none — refused if it no longer matches the preview. It writes in bulk
  (3,000 cases in about a second). Cases get references for their year of
  enquiry; the Notes column becomes a case note, headed as imported and dated
  by its latest entry. Each case is audited as created by import
  (batch and row), and the import with its counts.

## Assisted drafting

A first draft of a **position statement** for a SEND Tribunal appeal, written
from the case file for a caseworker to check, edit and approve (Drafting tab;
`apps/api/src/drafting`, `apps/api/src/ai/drafting-job.ts`).

- **Grounded in the file.** The model reads the whole case corpus — case
  record, documents, emails, notes, linked schools — each item carrying an id,
  and must cite the items every paragraph rests on. The server then checks
  every citation against the corpus (`groundDraft`): an invented citation is
  dropped, and a paragraph left with nothing behind it is **removed**, and
  counted, rather than shown as supported. Where the file gives a section no
  basis, the section says so instead of guessing; what the caseworker should
  obtain is listed.
- **Shown with its sources.** Each paragraph is numbered against its sources,
  with an excerpt of each and a link to open a document, so it can be checked
  in seconds. The screen says plainly that a source shows where a passage came
  from, not that it is right; a reworded paragraph is flagged for its sources
  to be re-checked. Case-file text cannot forge or close corpus items (the
  delimiters are neutralised for every AI feature).
- **Always reviewed before use.** Paragraphs can be edited, removed or added
  (a caseworker's own paragraph is marked as such). Approving needs an
  explicit "I have read and checked it", locks the draft, records who approved
  it and when, and files it as a Word document in Documents (Working
  Document). Nothing is filed before that.
- **The sections** — background, needs (B), provision (F), placement (I),
  issues in dispute, outcome sought — and their guidance live in `config.ts`.
- **How it runs.** Claude Opus 5.5 at high effort, through the AI job layer's
  `structured_output` mode (structured outputs, adaptive thinking, streamed;
  on a safety refusal the API retries on its default fallback model). The
  case-file block is prompt-cached. A draft is written in the background — a
  minute or two — and appears live; one stuck for 15 minutes is shown as
  failed. Requests are rate-limited; every request, edit, approval and discard
  is audited; spend shows under `GET /api/ai/spend` like every job.
- **Who.** Caseworkers and admins (`DRAFTING_ROLES`).
- **Can be switched off** with `AI_ENABLED` or the `draft_position_statement`
  job flag; the rest of the system is unaffected.
- **The AI key must have access to Claude Opus 5.5.** If it does not, a draft
  fails with a message saying so (an administrator enables the model in the
  Anthropic Console).

### SEND35 appeal form

The drafting tab also fills in the Tribunal's **SEND35** form ("Appeal a
decision about an EHC plan", version 02, 02.2026 — `SEND35_FORM` and
`SEND35_SECTIONS` in `config.ts`), on the same review-and-approve terms.

- **Facts are copied, not drafted.** Section 1 (the child's name and date of
  birth) and Section 2 (who is appealing, the parent's name, phone, email and
  address) are written by the system from the case record, so they cannot be
  paraphrased wrongly. They cite a "copied by the system" source listing
  exactly what was copied. What the record lacks (gender, title, relationship)
  is listed as a gap. Question 2.1 is suggested, to be confirmed with the
  family, for a child of compulsory school age; for a young person past it (the
  last Friday in June of the school year they turn 16) the choice is left to
  the family. A young person aged 25 or over is flagged.
- **Answers are drafted with sources**: other people involved and
  representation (3–7), the type of appeal (8), placement (9), the reasons for
  the appeal issue by issue (10), health and social care (11), mediation (12),
  reasons for lateness (13.3), other cases (14–15), support needs (17) and the
  supporting-evidence table, each paragraph citing the items it rests on.
- **The time limit.** The model reports the dates on the decision letter and
  mediation certificate with their sources (a date that is malformed or cites
  nothing is dropped). The system works out the deadline — two months from the
  letter or one month from the certificate, whichever is later, moved to the
  next working day if it ends on a weekend or bank holiday. It does this each
  time the draft is read (as at approval, once approved), so the warning — when
  within 14 days or passed — is never stale. If a caseworker edits or removes a
  date, the system stops working the deadline out and says so.
- **Filed for use.** Approval files a Word document of the answers, ending with
  a "Before you submit" list (warnings, gaps, documents to send, and Section 16
  and the declaration, which are for the appellant). The caseworker copies the
  answers into the online form or the PDF; links to both are on the draft.
- **Switched off separately** with the `draft_send35_appeal` job flag.

### SEND35A, SEND7 and SEND45

The same drafting fills three more of the Tribunal's forms, chosen under
**Fill in a Tribunal form** on the Drafting tab. Each form's sections, version,
dates and checklist are in `TRIBUNAL_FORMS` in `config.ts`; one function
(`completeTribunalForm`) writes the facts from the case record for all of them.

- **SEND35A** (appeal a refusal to assess, version 04.23): who the appeal is
  about (a child, or a young person over compulsory school age), the child and
  the appellant are copied from the record; the two questions of the legal test
  (s.36(8) Children and Families Act 2014) — whether the child has or may have
  special educational needs, and whether they may need an EHC plan — are
  drafted from the evidence. The local authority comes from the record, the
  decision letter and mediation certificate dates from the file; the time limit
  is worked out as for SEND35, and a missing mediation certificate is flagged
  (the Tribunal returns papers without one or an explanation).
- **SEND7** (request for change, version 08.23): the child's name, appeal
  number, local authority and final hearing date are copied — the key date
  titled "Final Hearing", never the Case Management Review. The request, the
  reasons and the local authority's response are drafted; a missing response is
  flagged, since the form is returned without it. If the file shows when the
  local authority was told, the draft works out the earliest sending date — the
  working day after their 5 working days to respond, skipping weekends and bank
  holidays — and warns until it is reached.
- **SEND45** (case review, version 11.23): the child's name, appeal number and
  the date the form is due (the "Case Review Form" date from the directions,
  else the final bundle deadline — never a supplementary bundle; a passed date
  is said to have passed) are copied; the issues still in dispute, the working
  document, placement, readiness, representative, supporter, witnesses and
  special requirements are drafted.

### The rest of the Tribunal's forms

Every other SEND Tribunal form a parent or young person completes is in the
same registry, mapped question by question from the published forms, and offered
on the Drafting tab grouped by stage (with a search). Each copies what the case
record holds and drafts the rest from the file, with its own checklist:

- **Starting an appeal:** SEND28 and SEND28A (a child, or a young person under
  18, detained in youth accommodation) — time limit as for SEND35.
- **Disability discrimination claims:** SEND4A and SEND4B (by a parent or a
  young person), SEND26A and SEND26B (after a permanent exclusion, fast-track)
  — six months starting with the date of the discrimination (Equality Act,
  Sch 17: the last day is the day before the same date six months on, and is
  not moved off a weekend); for an exclusion, starting with the Independent
  Review Panel's decision if there was one, else the governors upholding it.
- **During an appeal or claim:** SEND8 (withdrawal), SEND11 and SEND11YP
  (attendance — timed from the return date in the Tribunal's timetable),
  SEND30 (witness summons).
- **After the hearing or decision:** SEND15A, SEND15AYP and SEND16A (expenses —
  only the journey is drafted; tickets, receipts and bank details are for the
  claimant), SEND17 (missing tickets or receipts), SEND20A, SEND20B and SEND20C
  (permission to appeal, review, set aside — 28 days from the decision being
  sent; for permission to appeal the AI writes no grounds unless the file
  identifies an error of law).

Not included: SEND12 (completed by the local authority) and SEND21 (the
mediation certificate, completed by the mediation adviser). Each form can be
switched off with its own `draft_<form>` job flag.

- **Switched off separately** with the `draft_send35a_appeal`,
  `draft_send7_request` and `draft_send45_case_review` job flags.

## Schools directory

One record per school, shared by every case (`/schools`,
`apps/api/src/repositories/schools.ts`, `apps/web/src/features/schools`).

- **What a school holds.** Name, DfE URN, address and postcode, local
  authority, phone, email, website, type (maintained, academy, free school,
  independent, non-maintained special), provision (mainstream, mainstream with
  resource base, specialist, alternative provision), whether it is on the
  **Section 41** list, age range and notes — vocabularies in `config.ts`. Each
  school has named **contacts** (SENCo, headteacher and so on).
- **Search** by name (any word order; "St Mary's C of E" finds "Saint Marys
  CE"), URN, postcode, town or LA, and filter by type, provision and Section 41.
- **No duplicates by accident.** Adding a school that matches one already there
  (same URN, or the same name in the same postcode) shows the match and offers
  it instead; a reused URN is always refused.
- **Linked to cases.** A case's details list its schools — current, proposed,
  named in the plan, previous — with their facts, and which of each school's
  contacts are involved. A school can be found or added without leaving the
  case. Linking a current or proposed school fills in the child's _Current
  school_ / _Desired school_, so the case list, smart fill and the AI corpus say
  the same; a school typed on a case but not in the directory is flagged with a
  link to find it. The school's page lists every case it is linked to.
- **Who.** Everyone except read-only users can add and edit schools and
  contacts; only an admin can archive (hide) a school, which keeps existing
  links. Every change is audited; the directory updates live.

## Time recording

Time is recorded where the work is written up, ready for QuickBooks later
(`apps/api/src/repositories/time.ts`, `apps/web/src/features/time`).

- **A billable is a note plus its time.** Writing a billable on a case's
  Billables tab requires the time spent; plain case notes never carry time. Time
  is typed as people say it (`45m`, `1h 30`, `1.5`) or picked from quick
  buttons, and is **rounded up to 15-minute units** (`TIME_UNIT_MINUTES` in
  `config.ts`); the field says exactly what will be recorded before it is.
  Billables written before time recording show **No time recorded** with an
  _Add time_ action, and are listed on the writer's Time page until fixed.
- **Who records time.** Caseworkers and admins (`TIME_RECORDING_ROLES`);
  finance and read-only users write case notes only. A billable can be dated up
  to 31 days back (never in the future), for yesterday's call.
- **Who can change it.** A note's author or an admin may edit its text, time and
  date, or delete it (soft; a billable's time goes with it). Every create, edit
  and delete is audited; the note is locked while it changes.
- **Case totals.** The Billables tab shows the time on the case, by person.
- **My time** (`/time`): a person's recorded time by day, week or month, and
  what it earned. Everyone sees their own; admins can choose anyone.
- **Leavers.** Admins can still pick a leaver on the Time page (final pay), and
  time on a case deleted later still counts, marked as such.
- **Staff rates** (`/admin/rates`, admins only). Each member of staff has an
  hourly **pay rate** (what their time earns) and a **work rate** (what the work
  will be charged at in QuickBooks — empty until agreed). Rates are dated
  (`user_rates.effective_from`): each entry earns at the rate in force on its
  date, so a change never rewrites the past and a first rate can be backdated.
- **QuickBooks-ready.** `time_entries` already carries `external_sync_status`,
  `external_id` and `rate_snapshot` for the sync, which is not built yet.

## Email filing

Correspondence is filed against the case it belongs to (Documents / Emails tab,
`apps/api/src/email`, `apps/api/src/repositories/emails.ts`).

- **Drop it anywhere on the case's files.** An Outlook message saved as `.msg`
  (drag it from Outlook to the desktop, or File › Save As) or any `.eml` can be
  dropped on the Emails panel _or_ the Documents panel — several at once. Emails
  are always filed as emails; any other file is filed as a document, so staff
  never have to know which panel a file "belongs" to.
- **Attachments are documents in their own right.** Each attachment is filed in
  Documents under `Correspondence`, with the usual duplicate check (but never
  versioned against an unrelated file that happens to share its name), so an expert report sent by email is findable as a report. Small
  inline images (signature logos) are skipped. The original email file is kept,
  hidden from the documents list, and downloads through the audited content
  route.
- **Nothing filed twice.** An email is identified by its Message-ID (or, when it
  has none, a hash of sender, send time, subject and body), unique per case — so
  the same message filed by two people, or once as `.eml` and once as `.msg`, is
  recorded once and the second filing is reported as already filed.
- **Sent or received** is worked out, not asked: from a staff address, or from a
  domain a staff account uses that is not a public mail provider
  (`EMAIL_PUBLIC_DOMAINS` in `config.ts`), is _Sent_; anything else _Received_.
- **Safe to read.** Bodies are shown as plain text only — HTML is stored but
  never rendered, so nothing in an email can run in the browser.
- **One case history.** Filed emails join the case corpus (with attachment names
  and headers) for AI features, update live for everyone through the same
  `NOTIFY` channel, and every filing, duplicate and deletion is audited by
  identifier. Deleting an email is soft; ticking “also delete its attachments” (for an email filed on the wrong case) removes the attachments that filing added, never a file that was already on the case.
- **Not yet:** filing straight from Outlook (an add-in or Microsoft Graph) and
  automatic matching of unplaced email to cases with a review queue. Both build
  on the same `fileEmail` path; see `docs/roadmap.md`.

Demo files: `docs/demo/parent-email.eml` and `docs/demo/tribunal-bundle.msg`.

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

## Encryption of sensitive data

On top of the database's and the disk's own encryption at rest, the most
sensitive data is encrypted by the application, so a copy of the database or
the file store is unreadable without the key (`apps/api/src/crypto`).

- **What:** the child's SEND needs, the parent's additional needs and the case
  aims (special category information the database never searches, sorts or
  matches), and every stored document file — EHC plans, reports, orders and
  the original files of filed emails. Names, dates of birth and contact
  details stay readable to the database, which matches families by them;
  notes, emails and documents' extracted text, which search reads.
- **How:** AES-256-GCM (authenticated, so a tampered value fails to decrypt),
  a fresh random nonce per value, with separate keys for fields and files
  derived from `ENCRYPTION_KEY` by HKDF. Encryption and decryption happen in one
  place each — the repositories for fields, the storage layer for files — so
  the screens, AI drafting, search and the export are unchanged. Edits to these
  fields are audited encrypted too; the data export writes them decrypted (it
  is the charity's readable copy).
- **The key:** `ENCRYPTION_KEY` (at least 32 characters) is required — the
  API will not start without one. Render generates it (`render.yaml`). **Keep
  a copy**: without it the encrypted data cannot be read, even from a backup
  (`docs/disaster-recovery.md`). `ENCRYPTION_KEY_PREVIOUS` supports rotation.
- **Turning it on needs no downtime.** Data stored before encryption reads as
  it is; at start-up a background pass encrypts it — the fields, the sensitive
  values the audit trail recorded, and every file — and, after a rotation,
  re-encrypts under the new key. It is idempotent, one instance at a time,
  keeps records' "last updated" times (it is not an edit), records on each
  document which key its file is under so later starts read only new files,
  and logs and audits counts only.
- **Never all-or-nothing.** A value that cannot be decrypted shows as a
  marker (and is counted), so one bad value never breaks a page, the export or
  the pass; the export lists an unreadable file instead of stopping.

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
- **Sign-in is enforced.** On the demo deployment and in production every
  `/api` route (the live-updates WebSocket included) requires a valid session
  for an active user; only sign-in, health checks and the token-protected iCal
  feed are public. The `x-user-id` header and the first-user fallback exist for
  local development and tests only, and are ignored wherever sign-in is
  enforced (`apps/api/src/auth/gate.ts`).
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
browser session watches it update live. A second spec imports a made-up case
list workbook (`e2e/fixtures/case-list-sample.xlsx`). **axe-core** scans the key screens and
the build fails on any serious or critical violation. Both run in CI
(`.github/workflows/ci.yml`) against a PostgreSQL service.

### Render free tier

**Render's free tier spins services down after inactivity.** A spun-down
service drops all WebSocket connections and stops holding the `LISTEN`
connection, so live updates — and this feature as a whole — break until the
service is woken by the next HTTP request (which also incurs a cold start).
Run the API on a paid, always-on instance for live updates to hold.
