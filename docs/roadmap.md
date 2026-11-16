# Roadmap

What is built and what comes next, measured against the August 2026 proposal.
Decisions already taken with the charity are recorded here so they are not lost
between pieces of work.

## Built

- Case list (one view with filters, saved views and live updates; Staff, Team
  and Status changed in place with a click; a weekly review written in a row's
  drop-down, shown under Updated; teams TSA, ISA, Admin and Support).
- Case record, case notes and billables (labelled notes), audit trail.
- Adding a case: manual entry, query-form smart fill, duplicate detection.
- Tribunal directions orders: extraction, working-day arithmetic, reviewed diff.
- Shared calendar with a personal iCal feed.
- Weekly case review screen.
- Document storage with folders, versions and full-text extraction.
- **Email filing** (.msg and .eml) with attachments filed as documents,
  de-duplication, sent/received detection, live updates and the case corpus.
- **Time recording**: billables carry their time (15-minute units, required),
  case totals, a "My time" page with earnings, and admin-set dated pay and work
  rates.
- **Staff administration** (joiners, roles, leavers with case handover) and a
  **full data export** (every table as CSV and every document, in one ZIP).
- **Assisted drafting**: a position statement starter drawn only from the
  case file, every paragraph tied to its sources, reviewed and approved by a
  caseworker and filed as a Word document.
- **SEND35 appeal form answers**: the same drafting, for the Tribunal's form to
  appeal a decision about an EHC plan — child and appellant copied from the
  case record, the rest drafted with sources, the time limit worked out and
  flagged, filed with a "before you submit" list. Also **SEND35A** (refusal to
  assess), **SEND7** (request for change, with the earliest sending date) and
  **SEND45** (case review), and **every other form** a parent or young person
  completes: SEND28/28A, SEND4A/4B, SEND26A/26B, SEND8, SEND11/11YP, SEND30,
  SEND15A/15AYP, SEND16A, SEND17 and SEND20A/B/C.
- **Case list import**: the existing Excel case list brought in by an admin,
  columns matched to the system's headings, every row checked (new or
  existing client, duplicate, needs fixing) in simple and advanced views before
  one audited import.
- **One case history**: notes, billables, emails and documents in one
  chronological list on each case, filterable and searchable.
- **Search inside documents and emails**, across the caseload or one case,
  with highlighted snippets.
- **Schools directory**: shared schools with contacts, Section 41 and type
  facts, duplicate detection, and links to cases (current, proposed, named in
  the plan, previous).
- **Emails to file**: emails dropped in without a case are matched to their
  case from the reference, appeal number, client's email, names and contacts;
  confident matches are filed, the rest wait in a shared list with suggestions.
- **Bulk school import** from the DfE's Get Information About Schools file, by
  local authority, with every Section 41 school; re-run it to bring the
  directory up to date.
- **One navigation bar** across every screen (Cases, Calendar, Schools,
  Search, My time, and Admin for admins), the current section marked; admin
  screens share a sub-navigation. Moving between screens no longer reloads
  the page, and each screen's code loads when first opened.

## Next

### QuickBooks (when the integration is possible)

Time recording is built (decisions below, as agreed). Still to do: set the work
rates once agreed; sync clients, time and invoices to QuickBooks; draft invoices
from unbilled time for a director to approve; show invoice status on the case.

Time recording decisions agreed:

- **Billable = note + time.** A billable keeps its current form (a labelled
  note) and gains a time field when it is written, so caseworkers keep their
  habit and every billable becomes a real time entry (`time_entries`). Plain
  case notes are unchanged.
- **15-minute units.** Time is entered in, and rounded up to, quarter hours.
- **Minutes only at entry.** No charging rate is applied when time is recorded.
- **Time required on every billable**; billables written before this are
  flagged for someone to add time.
- **Earnings visible to the person and admins only.**
- **Author or admin** may edit or delete a billable and its time (audited).
- **Pay rate per user (admin-set).** An admin sets each user's rate so each
  person can see what they have earned per day, week and month.
- **Work rate (admin-set, later).** A separate rate for the work, which is what
  will apply in QuickBooks. Its values are not known yet; the setting exists but
  can stay empty.
- The `time_entries` table already carries `external_sync_status`,
  `external_id` and `rate_snapshot` for the later QuickBooks sync.

### Email filing, next steps

- File directly from Outlook (add-in or Microsoft Graph), on desktop and phone.
- Emails filed from Outlook feeding the same matching as _Emails to file_.

### Also outstanding from the proposal

- Assisted drafting: when HMCTS updates a form, update its `TRIBUNAL_FORMS`
  entry (version, sections) to match.
- SharePoint library migration: documents filed against the imported cases
  (folder per family or child, matched to clients and children, an admin
  confirming each match).
