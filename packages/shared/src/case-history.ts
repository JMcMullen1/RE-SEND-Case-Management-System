/**
 * case-history.ts — one chronological history of a case: its notes and
 * billables, the emails filed to it and the documents on it, so the story of
 * a case reads start to finish in one place. Pure: the screen already holds
 * each list (kept current by live updates); this merges, orders and filters
 * them.
 */

import type { DocumentInfo } from './case-detail';
import { londonToday } from './case-list';
import type { EmailInfo } from './email';
import type { NoteTimelineItem } from './timeline';

export const HISTORY_FILTER_VALUES = [
  'note',
  'billable',
  'email',
  'document',
] as const;
export type HistoryFilter = (typeof HISTORY_FILTER_VALUES)[number];
export const HISTORY_FILTER_LABELS: Record<HistoryFilter, string> = {
  note: 'Case notes',
  billable: 'Billables',
  email: 'Emails',
  document: 'Documents',
};

interface HistoryBase {
  /** Unique across kinds (a note and a document can share no key). */
  key: string;
  /** The civil date it belongs to in the UK (YYYY-MM-DD). */
  date: string;
  /** For ordering within a day. */
  at: string;
}

export type HistoryEntry =
  | (HistoryBase & { kind: 'note'; note: NoteTimelineItem })
  | (HistoryBase & { kind: 'email'; email: EmailInfo })
  | (HistoryBase & { kind: 'document'; document: DocumentInfo });

/** What an entry counts as, for the filters. */
export function historyFilterOf(entry: HistoryEntry): HistoryFilter {
  if (entry.kind === 'note')
    return entry.note.kind === 'billable' ? 'billable' : 'note';
  return entry.kind;
}

/**
 * Merge a case's notes, emails and documents into one history, newest first
 * (or oldest first). A document filed as an email's attachment is shown with
 * its email, not again on its own. Emails are dated when sent (else when
 * filed); documents when their current version was uploaded.
 */
export function buildCaseHistory(
  input: {
    notes: readonly NoteTimelineItem[];
    emails: readonly EmailInfo[];
    documents: readonly DocumentInfo[];
  },
  order: 'newest' | 'oldest' = 'newest',
): HistoryEntry[] {
  const attached = new Set(
    input.emails.flatMap((e) => e.attachments.map((a) => a.documentId)),
  );
  const entries: HistoryEntry[] = [
    ...input.notes.map((note): HistoryEntry => ({
      kind: 'note',
      key: `note:${note.id}`,
      date: note.occurredOn,
      at: note.createdAt,
      note,
    })),
    ...input.emails.map((email): HistoryEntry => {
      const at = email.sentAt ?? email.filedAt;
      return {
        kind: 'email',
        key: `email:${email.id}`,
        date: londonToday(new Date(at)),
        at,
        email,
      };
    }),
    ...input.documents
      .filter((d) => !attached.has(d.id))
      .map((document): HistoryEntry => ({
        kind: 'document',
        key: `document:${document.id}`,
        date: londonToday(new Date(document.uploadedAt)),
        at: document.uploadedAt,
        document,
      })),
  ];
  const sign = order === 'newest' ? -1 : 1;
  return entries.sort((a, b) =>
    a.date !== b.date
      ? (a.date < b.date ? -1 : 1) * sign
      : a.at !== b.at
        ? (a.at < b.at ? -1 : 1) * sign
        : a.key.localeCompare(b.key),
  );
}

/** The words an entry can be found by. */
function searchableText(entry: HistoryEntry): string {
  switch (entry.kind) {
    case 'note':
      return `${entry.note.body} ${entry.note.authorName ?? ''}`;
    case 'email': {
      const e = entry.email;
      return [
        e.subject,
        e.fromName,
        e.fromAddress,
        ...e.toAddresses,
        e.bodyText,
        ...e.attachments.map((a) => a.originalFilename),
      ]
        .filter(Boolean)
        .join(' ');
    }
    case 'document':
      return `${entry.document.originalFilename} ${entry.document.category} ${entry.document.uploadedByName ?? ''}`;
  }
}

/**
 * Narrow a history to the chosen kinds (none chosen means all) and to entries
 * containing every word typed, ignoring case.
 */
export function filterCaseHistory(
  entries: readonly HistoryEntry[],
  filters: { kinds?: readonly HistoryFilter[]; text?: string },
): HistoryEntry[] {
  const kinds = filters.kinds?.length ? new Set(filters.kinds) : null;
  const words = (filters.text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    if (kinds && !kinds.has(historyFilterOf(entry))) return false;
    if (!words.length) return true;
    const hay = searchableText(entry).toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
