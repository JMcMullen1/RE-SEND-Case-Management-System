import { sql } from 'drizzle-orm';
import { date, pgView, text, uuid } from 'drizzle-orm/pg-core';

/**
 * case_list_view — the row shape behind the case list.
 *
 * "Next key date" is the soonest key date on or after today that is not
 * superseded (and not soft-deleted). "Most recent note date" is the latest
 * dated note. Owner is shown as a named user OR a queue, exactly as stored.
 */
export const caseListView = pgView('case_list_view', {
  caseId: uuid('case_id'),
  clientDisplayName: text('client_display_name'),
  childPreferredName: text('child_preferred_name'),
  currentWork: text('current_work'),
  originalQuery: text('original_query'),
  ownerDisplayName: text('owner_display_name'),
  ownerQueue: text('owner_queue'),
  status: text('status'),
  nextKeyDate: date('next_key_date'),
  nextKeyDateTitle: text('next_key_date_title'),
  nextKeyDateType: text('next_key_date_type'),
  mostRecentNoteDate: date('most_recent_note_date'),
}).as(
  sql`
    SELECT
      c.id AS case_id,
      cl.display_name AS client_display_name,
      ch.preferred_name AS child_preferred_name,
      c.current_work AS current_work,
      c.original_query AS original_query,
      ou.display_name AS owner_display_name,
      c.owner_queue AS owner_queue,
      c.status AS status,
      nkd.date AS next_key_date,
      nkd.title AS next_key_date_title,
      nkd.type AS next_key_date_type,
      mrn.most_recent_note_date AS most_recent_note_date
    FROM cases c
    LEFT JOIN clients cl ON cl.id = c.client_id AND cl.deleted_at IS NULL
    LEFT JOIN children ch ON ch.id = c.child_id AND ch.deleted_at IS NULL
    LEFT JOIN users ou ON ou.id = c.owner_user_id
    LEFT JOIN LATERAL (
      SELECT kd.date, kd.title, kd.type
      FROM key_dates kd
      WHERE kd.case_id = c.id
        AND kd.deleted_at IS NULL
        AND kd.superseded_at IS NULL
        AND kd.date >= CURRENT_DATE
      ORDER BY kd.date ASC, kd.time ASC NULLS FIRST
      LIMIT 1
    ) nkd ON true
    LEFT JOIN LATERAL (
      SELECT max(cn.entry_date) AS most_recent_note_date
      FROM case_notes cn
      WHERE cn.case_id = c.id AND cn.deleted_at IS NULL
    ) mrn ON true
    WHERE c.deleted_at IS NULL
  `,
);
