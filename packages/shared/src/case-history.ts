/**
 * case-history.ts — one chronological history of a case: its notes and
 * billables, the emails filed to it and the documents on it, so the story of
 * a case reads start to finish in one place. Pure: the screen already holds
 * each list (kept current by live updates); this merges, orders and filters
 * them.
 */

import type { HistoryFilter } from './config';
import type { DocumentInfo } from './case-detail';
import { londonToday } from './case-list';
import type { EmailInfo } from './email';
import type { NoteTimelineItem } from './timeline';

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
  | (HistoryBase & {
      kind: 'document';
      document: DocumentInfo;
      /** Subjects of the emails it was attached to, if any. */
      attachedTo: string[];
    });

/** What an entry counts as, for the filters. */
export function historyFilterOf(entry: HistoryEntry): HistoryFilter {
  if (entry.kind === 'note')
    return entry.note.kind === 'billable' ? 'billable' : 'note';
  return entry.kind;
}

/**
 * Merge a case's notes, emails and documents into one history, newest first
 * (or oldest first). Every document appears on the day it was uploaded, and
 * one that was also an email's attachment says so (the same file can arrive
 * first by upload and later by email, so hiding it would misdate it). Emails
 * are dated when sent (else when filed). A note belongs to the day it is
 * about; one written on a later day sits at the end of its day.
 */
export function buildCaseHistory(
  input: {
    notes: readonly NoteTimelineItem[];
    emails: readonly EmailInfo[];
    documents: readonly DocumentInfo[];
  },
  order: 'newest' | 'oldest' = 'newest',
): HistoryEntry[] {
  const attachedTo = new Map<string, string[]>();
  for (const e of input.emails)
    for (const a of e.attachments)
      attachedTo.set(a.documentId, [
        ...(attachedTo.get(a.documentId) ?? []),
        e.subject || '(no subject)',
      ]);
  const entries: HistoryEntry[] = [
    ...input.notes.map((note): HistoryEntry => ({
      kind: 'note',
      key: `note:${note.id}`,
      date: note.occurredOn,
      // Written that day: when it was written; backdated: the end of its day.
      at:
        londonToday(new Date(note.createdAt)) === note.occurredOn
          ? note.createdAt
          : `${note.occurredOn}T23:59:59.999Z`,
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
    ...input.documents.map((document): HistoryEntry => ({
      kind: 'document',
      key: `document:${document.id}`,
      date: londonToday(new Date(document.uploadedAt)),
      at: document.uploadedAt,
      document,
      attachedTo: attachedTo.get(document.id) ?? [],
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
        ...e.ccAddresses,
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
