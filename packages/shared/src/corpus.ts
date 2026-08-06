/**
 * corpus.ts — the shape and serialisation of the case corpus.
 *
 * The corpus is the single reading surface for every AI feature: a case turned
 * into an ordered set of text items, each with a stable id a model can cite.
 * The assembly (database reads, exclusion of superseded/deleted rows, caching)
 * lives in the API; this module holds the pure, shared pieces — the item shape,
 * the delimited serialisation format, a token estimate, and the rendering of a
 * structured case into readable text.
 */

import type { CorpusItemType } from './config';

export interface CorpusItem {
  /** Stable id: the source row id, so a model can cite a specific item. */
  id: string;
  type: CorpusItemType;
  title: string;
  /** Civil date (YYYY-MM-DD) the item belongs to, or null if undated. */
  date: string | null;
  text: string;
}

export interface ExcludedCorpusItem {
  id: string;
  type: CorpusItemType;
  /** Why it was left out, stated rather than dropped silently. */
  reason: 'superseded' | 'deleted' | 'no-text';
}

export interface CorpusResult {
  caseId: string;
  items: CorpusItem[];
  /** Superseded document versions and soft-deleted rows, named explicitly. */
  excluded: ExcludedCorpusItem[];
  /** Item types that are registered but produce nothing yet (email, time_entry). */
  registeredEmpty: CorpusItemType[];
  /** Delimited serialisation carrying item ids (see serialiseCorpus). */
  serialised: string;
  /** Estimated token count of `serialised`. */
  tokenCount: number;
}

// --- Serialisation ----------------------------------------------------------

const ITEM_OPEN = '<<<CORPUS-ITEM';
const ITEM_CLOSE = '>>>';
const ITEM_END = '<<<END-ITEM>>>';

/**
 * Serialise items to a delimited string. Each block is framed by a header that
 * names the item id, type, date and title, so a model reading the corpus can
 * cite `id=<id>` for any statement. The format is deterministic and stable.
 */
export function serialiseCorpus(items: CorpusItem[]): string {
  return items
    .map((item) => {
      const header =
        `${ITEM_OPEN} id=${item.id} type=${item.type} ` +
        `date=${item.date ?? 'none'} title=${JSON.stringify(item.title)} ${ITEM_CLOSE}`;
      return `${header}\n${item.text}\n${ITEM_END}`;
    })
    .join('\n\n');
}

/**
 * Estimate the token count of a string. A heuristic, not a real tokeniser:
 * English text runs about four characters per token, but token-dense content
 * (identifiers, punctuation) runs closer to word count, so we take the larger
 * of the two for a safe budgeting figure.
 */
export function estimateTokenCount(text: string): number {
  if (text.length === 0) return 0;
  const byChars = Math.ceil(text.length / 4);
  const words = text.trim().split(/\s+/).length;
  const byWords = Math.ceil(words * 1.33);
  return Math.max(byChars, byWords);
}

// --- Case record rendering --------------------------------------------------

export interface CaseRecordInput {
  caseReference: string;
  status: string;
  dateOfEnquiry: string | null;
  originalQuery: string | null;
  currentWork: string | null;
  team: string[];
  aims: string | null;
  supportLevel: string | null;
  consultStatus: string | null;
  client: {
    displayName: string;
    dsplArea: string | null;
    additionalNeeds: string | null;
  } | null;
  child: {
    fullName: string;
    dateOfBirth: string | null;
    schoolYear: string | null;
    currentSchoolName: string | null;
    desiredSchool: string | null;
    sendNeeds: string | null;
  } | null;
}

/**
 * Render the structured case into readable, labelled text — the `case_record`
 * corpus item. Only fields that are present are emitted, so an AI feature reads
 * a clean summary rather than a wall of "null".
 */
export function renderCaseRecordText(record: CaseRecordInput): string {
  const lines: string[] = [`Case reference: ${record.caseReference}`];
  const add = (label: string, value: string | null | undefined) => {
    if (value) lines.push(`${label}: ${value}`);
  };
  add('Status', record.status);
  add('Date of enquiry', record.dateOfEnquiry);
  add('Original query', record.originalQuery);
  add('Current work', record.currentWork);
  if (record.team.length > 0) add('Team', record.team.join(', '));
  add('Consultation', record.consultStatus);
  add('Support level', record.supportLevel);
  add('Aims', record.aims);

  if (record.client) {
    lines.push('', 'Client:');
    add('  Name', record.client.displayName);
    add('  DSPL area', record.client.dsplArea);
    add('  Additional needs', record.client.additionalNeeds);
  }
  if (record.child) {
    lines.push('', 'Child:');
    add('  Name', record.child.fullName);
    add('  Date of birth', record.child.dateOfBirth);
    add('  School year', record.child.schoolYear);
    add('  Current school', record.child.currentSchoolName);
    add('  Desired school', record.child.desiredSchool);
    add('  SEND needs', record.child.sendNeeds);
  }
  return lines.join('\n');
}
