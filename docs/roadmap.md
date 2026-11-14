# Roadmap

What is built and what comes next, measured against the August 2026 proposal.
Decisions already taken with the charity are recorded here so they are not lost
between pieces of work.

## Built

- Case list (simple and advanced views, filters, saved views, live updates).
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
- **Assisted drafting**: a position statement starter drawn only from the
  case file, every paragraph tied to its sources, reviewed and approved by a
  caseworker and filed as a Word document.
- **Schools directory**: shared schools with contacts, Section 41 and type
  facts, duplicate detection, and links to cases (current, proposed, named in
  the plan, previous).

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
- Automatic matching of correspondence to a case from the client and child
  details held, with a queue for anything that cannot be matched confidently.
- Emails in a single merged case history alongside notes and documents.

### Schools directory, next steps

- Import schools in bulk from the DfE's Get Information About Schools list
  (URN, type, age range and address), and the published Section 41 list.

### Also outstanding from the proposal

- Assisted drafting, next: complete SEND Tribunal forms (e.g. the appeal
  form) from the case record and documents, with the same grounding and
  approval.
- Staff administration screen (joiners and leavers) and full data export.
- SharePoint library migration.
