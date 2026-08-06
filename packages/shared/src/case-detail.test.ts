import { describe, expect, it } from 'vitest';
import { calculateAge, formatFileSize, isPreviewable } from './case-detail';
import { sortTimeline, type TimelineItem } from './timeline';

describe('calculateAge', () => {
  it('counts whole years and respects birthdays', () => {
    expect(calculateAge('2015-09-14', '2026-09-14')).toBe(11);
    expect(calculateAge('2015-09-15', '2026-09-14')).toBe(10); // birthday tomorrow
    expect(calculateAge(null, '2026-09-14')).toBeNull();
  });
});

describe('formatFileSize', () => {
  it('renders bytes, KB and MB', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(48_000)).toBe('47 KB');
    expect(formatFileSize(2_500_000)).toBe('2.4 MB');
  });
});

describe('isPreviewable', () => {
  it('is true for PDFs and images only', () => {
    expect(isPreviewable('application/pdf')).toBe(true);
    expect(isPreviewable('image/png')).toBe(true);
    expect(isPreviewable('text/plain')).toBe(false);
  });
});

describe('sortTimeline', () => {
  it('orders newest first, tie-breaking on createdAt', () => {
    const items: TimelineItem[] = [
      {
        id: 'a',
        type: 'note',
        occurredOn: '2026-09-10',
        createdAt: '2026-09-10T09:00:00Z',
        authorUserId: null,
        authorName: null,
        body: 'old',
        canEdit: false,
        edited: false,
      },
      {
        id: 'b',
        type: 'note',
        occurredOn: '2026-09-12',
        createdAt: '2026-09-12T09:00:00Z',
        authorUserId: null,
        authorName: null,
        body: 'new',
        canEdit: false,
        edited: false,
      },
      {
        id: 'c',
        type: 'note',
        occurredOn: '2026-09-12',
        createdAt: '2026-09-12T11:00:00Z',
        authorUserId: null,
        authorName: null,
        body: 'newer same day',
        canEdit: false,
        edited: false,
      },
    ];
    expect(sortTimeline(items).map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });
});
