/**
 * search.ts — searching inside documents and emails, across one case or the
 * whole caseload. The database does the matching (Postgres full-text search,
 * English stemming, so "assessment" finds "assessed"); this file holds the
 * shapes and the one piece of pure logic: turning a highlighted snippet into
 * plain text runs, so the browser never renders markup from a document.
 */

import type { SearchScope } from './config';

/** Marks the start and end of a matched term in a snippet. */
export const SNIPPET_MATCH_START = '\u0001';
export const SNIPPET_MATCH_END = '\u0002';

export interface SearchHit {
  kind: 'document' | 'email';
  /** The document's id, or the email's. */
  id: string;
  caseId: string;
  caseReference: string;
  childName: string | null;
  clientName: string | null;
  /** The filename, or the email's subject. */
  title: string;
  /** The document's folder; for an email, who it is from. */
  detail: string | null;
  /** Upload date, or when the email was sent or received (ISO). */
  date: string | null;
  /** For a document: whether it is the version in force. */
  current: boolean;
  /** Text around the matches, with matches between the snippet markers. */
  snippet: string;
}

export interface SearchRequest {
  q: string;
  caseId?: string | null;
  scope?: SearchScope;
  folder?: string | null;
  includeEarlierVersions?: boolean;
}

export interface SearchResult {
  hits: SearchHit[];
  /** How many items matched in all (hits holds the best of them). */
  total: number;
}

/** A snippet as runs of plain text, each marked as a match or not. */
export function snippetRuns(
  snippet: string,
): { text: string; match: boolean }[] {
  const runs: { text: string; match: boolean }[] = [];
  let match = false;
  let text = '';
  for (const ch of snippet) {
    if (ch === SNIPPET_MATCH_START || ch === SNIPPET_MATCH_END) {
      if (text) runs.push({ text, match });
      text = '';
      match = ch === SNIPPET_MATCH_START;
    } else text += ch;
  }
  if (text) runs.push({ text, match });
  return runs;
}
