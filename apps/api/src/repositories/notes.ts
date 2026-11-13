import { and, eq, isNull } from 'drizzle-orm';
import {
  canRecordTime,
  roundUpToUnit,
  type NoteKind,
  type NoteTimelineItem,
} from '@re-send/shared';
import { getDb } from '../db/client';
import { caseNotes, timeEntries } from '../db/schema';
import { recordAudit } from './audit';

export class NoteForbidden extends Error {}
export class NoteInvalid extends Error {}

interface Actor {
  id: string;
  displayName: string;
  role: string;
}

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Write a note. A billable is a labelled note plus its time: the two are
 * written together in one transaction (the time rounded up to the recording
 * unit), so a billable can never exist without its time. Only roles that
 * record time may write billables.
 */
export async function addNote(
  caseId: string,
  body: string,
  kind: NoteKind,
  entryDate: string,
  actor: Actor,
  minutes?: number,
): Promise<NoteTimelineItem> {
  if (kind === 'billable') {
    if (!canRecordTime(actor.role)) {
      throw new NoteForbidden('Your role does not record billable time.');
    }
    if (minutes === undefined) {
      throw new NoteInvalid('A billable needs the time spent.');
    }
  }
  const recorded =
    kind === 'billable' && minutes !== undefined
      ? roundUpToUnit(minutes)
      : null;
  const db = getDb();
  const row = await db.transaction(async (tx) => {
    const [note] = await tx
      .insert(caseNotes)
      .values({ caseId, body, kind, entryDate, authorUserId: actor.id })
      .returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: 'note.create',
      entityType: 'note',
      entityId: note!.id,
      after: { caseId, entryDate, kind },
    });
    if (recorded !== null) {
      const [entry] = await tx
        .insert(timeEntries)
        .values({
          caseId,
          userId: actor.id,
          entryDate,
          minutes: recorded,
          billable: true,
          noteId: note!.id,
        })
        .returning({ id: timeEntries.id });
      await recordAudit(tx, {
        actorUserId: actor.id,
        action: 'time.create',
        entityType: 'time_entry',
        entityId: entry!.id,
        after: { caseId, noteId: note!.id, entryDate, minutes: recorded },
      });
    }
    return note!;
  });
  return {
    id: row.id,
    type: 'note',
    kind: row.kind as NoteKind,
    occurredOn: row.entryDate,
    createdAt: row.createdAt.toISOString(),
    authorUserId: actor.id,
    authorName: actor.displayName,
    body: row.body,
    canEdit: true,
    edited: false,
    minutes: recorded,
  };
}

/**
 * Lock a live note for change inside a transaction, checking the actor may
 * change it. Locking serialises an edit against a concurrent delete or a
 * second edit, so time can never be left on a deleted note or recorded twice.
 */
async function lockEditable(tx: Tx, noteId: string, actor: Actor) {
  const [note] = await tx
    .select()
    .from(caseNotes)
    .where(eq(caseNotes.id, noteId))
    .for('update');
  if (!note || note.deletedAt) return null;
  if (note.authorUserId !== actor.id && actor.role !== 'admin') {
    throw new NoteForbidden(
      'Only the author or an admin may change this note.',
    );
  }
  return note;
}

/**
 * Edit a note's text and, for a billable, its time and date. Allowed for its
 * author or an admin; each change is audited. Adding time to a billable written
 * before time recording creates its entry, attributed to the note's author.
 */
export async function editNote(
  noteId: string,
  patch: { body?: string; minutes?: number; entryDate?: string },
  actor: Actor,
): Promise<{ item: NoteTimelineItem; caseId: string } | null> {
  return getDb().transaction(async (tx) => {
    const before = await lockEditable(tx, noteId, actor);
    if (!before) return null;
    if (before.kind !== 'billable' && patch.minutes !== undefined) {
      throw new NoteInvalid('Time is recorded on billables, not case notes.');
    }

    const noteChanges: { body?: string; entryDate?: string } = {};
    if (patch.body !== undefined && patch.body !== before.body)
      noteChanges.body = patch.body;
    if (patch.entryDate !== undefined && patch.entryDate !== before.entryDate)
      noteChanges.entryDate = patch.entryDate;
    if (noteChanges.body !== undefined || noteChanges.entryDate !== undefined) {
      await tx
        .update(caseNotes)
        .set({ ...noteChanges, updatedAt: new Date() })
        .where(eq(caseNotes.id, noteId));
      await recordAudit(tx, {
        actorUserId: actor.id,
        action: 'note.edit',
        entityType: 'note',
        entityId: noteId,
        before: {
          ...(noteChanges.body !== undefined ? { body: before.body } : {}),
          ...(noteChanges.entryDate !== undefined
            ? { entryDate: before.entryDate }
            : {}),
        },
        after: noteChanges,
      });
    }
    const entryDate = noteChanges.entryDate ?? before.entryDate;

    const [entry] = await tx
      .select()
      .from(timeEntries)
      .where(
        and(eq(timeEntries.noteId, noteId), isNull(timeEntries.deletedAt)),
      );
    let minutes = entry?.minutes ?? null;
    const recorded =
      patch.minutes !== undefined ? roundUpToUnit(patch.minutes) : null;

    if (entry) {
      const set: { minutes?: number; entryDate?: string } = {};
      if (recorded !== null && recorded !== entry.minutes)
        set.minutes = recorded;
      if (entryDate !== entry.entryDate) set.entryDate = entryDate;
      if (set.minutes !== undefined || set.entryDate !== undefined) {
        await tx
          .update(timeEntries)
          .set({ ...set, updatedAt: new Date() })
          .where(eq(timeEntries.id, entry.id));
        await recordAudit(tx, {
          actorUserId: actor.id,
          action: 'time.edit',
          entityType: 'time_entry',
          entityId: entry.id,
          before: {
            ...(set.minutes !== undefined ? { minutes: entry.minutes } : {}),
            ...(set.entryDate !== undefined
              ? { entryDate: entry.entryDate }
              : {}),
          },
          after: set,
        });
        minutes = set.minutes ?? entry.minutes;
      }
    } else if (recorded !== null) {
      const [created] = await tx
        .insert(timeEntries)
        .values({
          caseId: before.caseId,
          userId: before.authorUserId,
          entryDate,
          minutes: recorded,
          billable: true,
          noteId,
        })
        .returning({ id: timeEntries.id });
      await recordAudit(tx, {
        actorUserId: actor.id,
        action: 'time.create',
        entityType: 'time_entry',
        entityId: created!.id,
        after: { caseId: before.caseId, noteId, entryDate, minutes: recorded },
      });
      minutes = recorded;
    }

    const [row] = await tx
      .select()
      .from(caseNotes)
      .where(eq(caseNotes.id, noteId));
    return {
      item: {
        id: row!.id,
        type: 'note' as const,
        kind: row!.kind as NoteKind,
        occurredOn: row!.entryDate,
        createdAt: row!.createdAt.toISOString(),
        authorUserId: row!.authorUserId,
        authorName: null,
        body: row!.body,
        canEdit: true,
        edited:
          noteChanges.body !== undefined ||
          row!.updatedAt.getTime() - row!.createdAt.getTime() > 1000,
        minutes: row!.kind === 'billable' ? minutes : null,
      },
      caseId: row!.caseId,
    };
  });
}

/**
 * Delete a note (and, for a billable, its time). Soft and audited; allowed for
 * its author or an admin. Returns the case id, or null if there was no note.
 */
export async function deleteNote(
  noteId: string,
  actor: Actor,
): Promise<{ caseId: string } | null> {
  return getDb().transaction(async (tx) => {
    const note = await lockEditable(tx, noteId, actor);
    if (!note) return null;
    const now = new Date();
    await tx
      .update(caseNotes)
      .set({ deletedAt: now })
      .where(eq(caseNotes.id, noteId));
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: 'note.delete',
      entityType: 'note',
      entityId: noteId,
      before: { caseId: note.caseId, kind: note.kind },
    });
    const removed = await tx
      .update(timeEntries)
      .set({ deletedAt: now })
      .where(and(eq(timeEntries.noteId, noteId), isNull(timeEntries.deletedAt)))
      .returning({ id: timeEntries.id, minutes: timeEntries.minutes });
    for (const r of removed) {
      await recordAudit(tx, {
        actorUserId: actor.id,
        action: 'time.delete',
        entityType: 'time_entry',
        entityId: r.id,
        before: { caseId: note.caseId, noteId, minutes: r.minutes },
      });
    }
    return { caseId: note.caseId };
  });
}
