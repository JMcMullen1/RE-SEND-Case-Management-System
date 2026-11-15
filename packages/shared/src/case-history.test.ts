import { describe, expect, it } from 'vitest';
import {
  buildCaseHistory,
  filterCaseHistory,
  historyFilterOf,
} from './case-history';
import type { DocumentInfo } from './case-detail';
import type { EmailInfo } from './email';
import type { NoteTimelineItem } from './timeline';

// Made-up case history.
const note = (
  id: string,
  occurredOn: string,
  body: string,
  kind: 'note' | 'billable' = 'note',
): NoteTimelineItem => ({
  id,
  type: 'note',
  kind,
  occurredOn,
  createdAt: `${occurredOn}T10:00:00.000Z`,
  authorUserId: 'u1',
  authorName: 'Pat Caseworker',
  body,
  canEdit: true,
  edited: false,
  minutes: kind === 'billable' ? 30 : null,
});
const email: EmailInfo = {
  id: 'e1',
  subject: 'Final EHC plan issued',
  fromName: 'Made Up Officer',
  fromAddress: 'officer@la.example',
  toAddresses: ['parent@example.org'],
  ccAddresses: ['copied@example.org'],
  // 23:30 on 2 March in London (GMT) is still 2 March.
  sentAt: '2026-03-02T23:30:00.000Z',
  direction: 'inbound',
  bodyText: 'Please find attached the final plan for Robin.',
  attachments: [
    {
      documentId: 'd-attached',
      originalFilename: 'final-plan.pdf',
      mimeType: 'application/pdf',
      byteSize: 100,
      category: 'EHCP Final',
    },
  ],
  filedByName: 'Pat Caseworker',
  filedAt: '2026-03-04T09:00:00.000Z',
  rawDocumentId: null,
};
const doc = (id: string, uploadedAt: string, name: string): DocumentInfo => ({
  id,
  originalFilename: name,
  mimeType: 'application/pdf',
  byteSize: 100,
  category: 'Expert Report',
  uploadedByName: 'Pat Caseworker',
  uploadedAt,
  version: 1,
  versionCount: 1,
});
const input = {
  notes: [
    note('n1', '2026-03-01', 'Parent called about the draft plan.'),
    note('n2', '2026-03-05', 'Reviewed the final plan.', 'billable'),
  ],
  emails: [email],
  documents: [
    doc('d1', '2026-03-03T12:00:00.000Z', 'ep-report.pdf'),
    doc('d-attached', '2026-03-04T09:00:00.000Z', 'final-plan.pdf'),
  ],
};

describe('buildCaseHistory', () => {
  it('merges notes, emails and documents in date order', () => {
    const newest = buildCaseHistory(input);
    expect(newest.map((e) => e.key)).toEqual([
      'note:n2',
      'document:d-attached',
      'document:d1',
      'email:e1',
      'note:n1',
    ]);
    expect(buildCaseHistory(input, 'oldest').map((e) => e.key)).toEqual([
      'note:n1',
      'email:e1',
      'document:d1',
      'document:d-attached',
      'note:n2',
    ]);
    // An attachment is still shown on its upload day, saying which email it came with.
    const attached = newest.find((e) => e.key === 'document:d-attached')!;
    expect(attached.kind === 'document' && attached.attachedTo).toEqual([
      'Final EHC plan issued',
    ]);
    // Emails are dated when sent, in UK time.
    expect(newest.find((e) => e.kind === 'email')!.date).toBe('2026-03-02');
  });

  it('dates an email with no sent time by when it was filed, in UK time', () => {
    const [entry] = buildCaseHistory({
      notes: [],
      documents: [],
      // 23:30 UTC on 30 June is 00:30 on 1 July in London (BST).
      emails: [{ ...email, sentAt: null, filedAt: '2026-06-30T23:30:00.000Z' }],
    });
    expect(entry!.date).toBe('2026-07-01');
  });
});

describe('filterCaseHistory', () => {
  const all = buildCaseHistory(input);
  it('keeps the chosen kinds, or all when none are chosen', () => {
    expect(filterCaseHistory(all, {}).length).toBe(5);
    expect(
      filterCaseHistory(all, { kinds: ['email', 'billable'] }).map(
        historyFilterOf,
      ),
    ).toEqual(['billable', 'email']);
  });

  it('finds every word typed, in notes, emails (and their attachments) and documents', () => {
    const keys = (text: string) =>
      filterCaseHistory(all, { text }).map((e) => e.key);
    expect(keys('final plan')).toEqual([
      'note:n2',
      'document:d-attached',
      'email:e1',
    ]);
    expect(keys('FINAL-PLAN.PDF')).toEqual(['document:d-attached', 'email:e1']);
    expect(keys('officer@la.example')).toEqual(['email:e1']);
    expect(keys('copied@example.org')).toEqual(['email:e1']);
    expect(keys('ep-report')).toEqual(['document:d1']);
    expect(keys('nothing-like-this')).toEqual([]);
  });
});

describe('backdated notes', () => {
  it('sit at the end of the day they are about', () => {
    const late = {
      ...note('n9', '2026-03-02', 'Summary of the call on 2 March.'),
      createdAt: '2026-03-05T09:00:00.000Z',
    };
    const order = buildCaseHistory(
      { notes: [late], emails: [email], documents: [] },
      'oldest',
    ).map((e) => e.key);
    // The email was sent at 23:30 on 2 March; the note was written on 5 March.
    expect(order).toEqual(['email:e1', 'note:n9']);
  });
});
