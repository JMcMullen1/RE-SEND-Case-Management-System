/**
 * timeline.ts — the merged case timeline as a typed, extensible union.
 *
 * Staff think in terms of what happened on the case, not what was billed, so
 * notes, time entries, emails, documents and key-date changes share one
 * chronological stream. Only `note` carries data today; the other variants are
 * registered so adding them later is additive — a new `case` in the renderer,
 * never a rewrite.
 */

export const TIMELINE_ITEM_TYPES = [
  'note',
  'time_entry',
  'email',
  'document',
  'key_date_change',
] as const;
export type TimelineItemType = (typeof TIMELINE_ITEM_TYPES)[number];

interface TimelineItemBase {
  id: string;
  type: TimelineItemType;
  /** Civil date the item belongs to (YYYY-MM-DD) — drives ordering and grouping. */
  occurredOn: string;
  /** Timestamp for stable tie-breaking within a day. */
  createdAt: string;
  authorUserId: string | null;
  authorName: string | null;
}

export interface NoteTimelineItem extends TimelineItemBase {
  type: 'note';
  body: string;
  /** True when the acting user may edit this note (its author, or an admin). */
  canEdit: boolean;
  /** True when the note has been edited since it was written. */
  edited: boolean;
}

// --- Registered but not yet emitted -----------------------------------------

export interface TimeEntryTimelineItem extends TimelineItemBase {
  type: 'time_entry';
  minutes: number;
  narrative: string | null;
  billable: boolean;
}

export interface EmailTimelineItem extends TimelineItemBase {
  type: 'email';
  subject: string | null;
  direction: string;
}

export interface DocumentTimelineItem extends TimelineItemBase {
  type: 'document';
  filename: string;
  category: string;
}

export interface KeyDateChangeTimelineItem extends TimelineItemBase {
  type: 'key_date_change';
  summary: string;
}

export type TimelineItem =
  | NoteTimelineItem
  | TimeEntryTimelineItem
  | EmailTimelineItem
  | DocumentTimelineItem
  | KeyDateChangeTimelineItem;

/** Newest first, breaking ties on the creation timestamp. */
export function sortTimeline(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => {
    if (a.occurredOn !== b.occurredOn)
      return a.occurredOn < b.occurredOn ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}
