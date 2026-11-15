import { randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import {
  SEARCH_INDEXED_CHARS,
  SEARCH_MAX_RESULTS,
  SNIPPET_MATCH_END,
  SNIPPET_MATCH_START,
  type SearchHit,
  type SearchRequest,
  type SearchResult,
} from '@re-send/shared';
import { getDb } from '../db/client';
import { recordAudit } from './audit';

// These two expressions must match the indexes in migration 0017 exactly, or
// Postgres cannot use them (and every search reads every row).
const DOCUMENT_VECTOR = sql.raw(`(
  setweight(to_tsvector('english', coalesce(d.original_filename, '')), 'A') ||
  setweight(to_tsvector('english', left(coalesce(d.extracted_text, ''), ${SEARCH_INDEXED_CHARS})), 'B')
)`);
const EMAIL_VECTOR = sql.raw(`(
  setweight(to_tsvector('english', coalesce(e.subject, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(e.from_name, '') || ' ' || coalesce(e.from_address, '')), 'B') ||
  setweight(to_tsvector('english', left(coalesce(e.body_text, ''), ${SEARCH_INDEXED_CHARS})), 'C')
)`);

/** Snippet options: up to two short passages, matches between the markers. */
const HEADLINE_OPTIONS = `StartSel=${SNIPPET_MATCH_START}, StopSel=${SNIPPET_MATCH_END}, MaxWords=30, MinWords=12, MaxFragments=2, FragmentDelimiter=" … "`;

interface Row {
  kind: 'document' | 'email';
  id: string;
  case_id: string;
  case_reference: string;
  child_name: string | null;
  client_name: string | null;
  title: string;
  detail: string | null;
  date: Date | string | null;
  current: boolean;
  snippet: string | null;
}

/**
 * Search inside the documents and emails held on cases — one case, or the
 * whole caseload. Words are matched with English stemming ("assessed" finds
 * "assessment"); quoted phrases, OR and -word work as in a web search. A
 * document's name counts more than its text, an email's subject more than
 * its body. Deleted documents and cases are never found; earlier versions of
 * a document only when asked for. The original file of a filed email is not
 * searched as a document (its text is the email's). Each search is audited
 * (scope and result count — never the words searched for).
 */
export async function searchFiles(
  request: SearchRequest,
  actor: string | null,
): Promise<SearchResult> {
  const db = getDb();
  const query = sql`websearch_to_tsquery('english', ${request.q})`;
  const scope = request.scope ?? 'all';
  const caseFilter = (column: SQL) =>
    request.caseId ? sql`AND ${column} = ${request.caseId}` : sql``;

  const documentMatches = sql`
    SELECT 'document' AS kind, d.id, d.case_id,
           ts_rank(${DOCUMENT_VECTOR}, ${query}) AS rank,
           d.uploaded_at AS date
    FROM documents d
    JOIN cases c ON c.id = d.case_id AND c.deleted_at IS NULL
    WHERE d.deleted_at IS NULL
      AND ${DOCUMENT_VECTOR} @@ ${query}
      ${caseFilter(sql.raw('d.case_id'))}
      ${request.includeEarlierVersions ? sql`` : sql`AND d.superseded_by_id IS NULL`}
      ${request.folder ? sql`AND d.category = ${request.folder}` : sql``}
      AND NOT EXISTS (
        SELECT 1 FROM emails x
        WHERE x.raw_document_id = d.id AND x.deleted_at IS NULL
      )`;
  const emailMatches = sql`
    SELECT 'email' AS kind, e.id, e.case_id,
           ts_rank(${EMAIL_VECTOR}, ${query}) AS rank,
           coalesce(e.sent_at, e.received_at, e.created_at) AS date
    FROM emails e
    JOIN cases c ON c.id = e.case_id AND c.deleted_at IS NULL
    WHERE e.deleted_at IS NULL
      AND ${EMAIL_VECTOR} @@ ${query}
      ${caseFilter(sql.raw('e.case_id'))}`;
  // A folder is a document's; emails have none, so a folder means documents.
  const parts =
    scope === 'documents' || request.folder
      ? [documentMatches]
      : scope === 'emails'
        ? [emailMatches]
        : [documentMatches, emailMatches];
  const matches = sql.join(parts, sql` UNION ALL `);

  // Rank everything, but write snippets (the costly part) for the best only.
  const rows = (await db.execute(sql`
    WITH matches AS (${matches}),
    best AS (
      SELECT * FROM matches ORDER BY rank DESC, date DESC NULLS LAST
      LIMIT ${SEARCH_MAX_RESULTS}
    )
    SELECT b.kind, b.id, b.case_id, c.case_reference,
           ch.full_name AS child_name, cl.display_name AS client_name,
           coalesce(d.original_filename, nullif(e.subject, ''), '(no subject)') AS title,
           CASE WHEN b.kind = 'document' THEN d.category
                ELSE coalesce(nullif(e.from_name, ''), e.from_address) END AS detail,
           b.date,
           (b.kind = 'email' OR d.superseded_by_id IS NULL) AS current,
           CASE WHEN b.kind = 'document' THEN
             ts_headline('english', left(coalesce(d.extracted_text, d.original_filename), ${SEARCH_INDEXED_CHARS}), ${query}, ${HEADLINE_OPTIONS})
           ELSE
             ts_headline('english', left(coalesce(nullif(e.body_text, ''), e.subject, ''), ${SEARCH_INDEXED_CHARS}), ${query}, ${HEADLINE_OPTIONS})
           END AS snippet
    FROM best b
    JOIN cases c ON c.id = b.case_id
    LEFT JOIN children ch ON ch.id = c.child_id
    LEFT JOIN clients cl ON cl.id = c.client_id
    LEFT JOIN documents d ON b.kind = 'document' AND d.id = b.id
    LEFT JOIN emails e ON b.kind = 'email' AND e.id = b.id
    ORDER BY b.rank DESC, b.date DESC NULLS LAST
  `)) as unknown as Row[];
  const [count] = (await db.execute(
    sql`SELECT count(*)::int AS n FROM (${matches}) m`,
  )) as unknown as { n: number }[];

  const hits: SearchHit[] = rows.map((r) => ({
    kind: r.kind,
    id: r.id,
    caseId: r.case_id,
    caseReference: r.case_reference,
    childName: r.child_name,
    clientName: r.client_name,
    title: r.title,
    detail: r.detail,
    date: r.date instanceof Date ? r.date.toISOString() : (r.date ?? null),
    current: r.current,
    // Line breaks and spacing from the file collapsed to single spaces.
    snippet: (r.snippet ?? '').replace(/\s+/g, ' ').trim(),
  }));
  const total = count?.n ?? hits.length;

  await recordAudit(db, {
    actorUserId: actor,
    action: 'search.files',
    entityType: request.caseId ? 'case' : 'search',
    entityId: request.caseId ?? randomUUID(),
    after: {
      scope,
      folder: Boolean(request.folder),
      includeEarlierVersions: Boolean(request.includeEarlierVersions),
      results: total,
    },
  });
  return { hits, total };
}
