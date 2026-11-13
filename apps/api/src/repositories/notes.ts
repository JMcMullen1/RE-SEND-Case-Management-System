import { and, eq, isNull } from 'drizzle-orm';
import {
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

/**
 * Write a note. A billable is a labelled note plus its time: the two are
 * written together in one transaction (the time rounded up to the recording
 * unit), so a billable can never exist without its time.
 */
export async function addNote(
  caseId: string,
  body: string,
  kind: NoteKind,
  entryDate: string,
  actor: Actor,
  minutes?: number,
): Promise<NoteTimelineItem> {
  if (kind === 'billable' && minutes === undefined) {
    throw new NoteInvalid('A billable needs the time spent.');
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

async function loadEditable(noteId: string, actor: Actor) {
  const [note] = await getDb()
    .select()
    .from(caseNotes)
    .where(eq(caseNotes.id, noteId));
  if (!note || note.deletedAt) return null;
  if (note.authorUserId !== actor.id && actor.role !== 'admin') {
    throw new NoteForbidden(
      'Only the author or an admin may change this note.',
    );
  }
  return note;
}

/**
 * Edit a note's text and, for a billable, its time. Allowed for its author or
 * an admin; each change is audited. Adding time to a billable written before
 * time recording creates its entry, attributed to the note's author.
 */
export async function editNote(
  noteId: string,
  patch: { body?: string; minutes?: number },
  actor: Actor,
): Promise<{ item: NoteTimelineItem; caseId: string } | null> {
  const before = await loadEditable(noteId, actor);
  if (!before) return null;
  if (patch.minutes !== undefined && before.kind !== 'billable') {
    throw new NoteInvalid('Time is recorded on billables, not case notes.');
  }
  const db = getDb();

  const minutes = await db.transaction(async (tx) => {
    if (patch.body !== undefined && patch.body !== before.body) {
      await tx
        .update(caseNotes)
        .set({ body: patch.body, updatedAt: new Date() })
        .where(eq(caseNotes.id, noteId));
      await recordAudit(tx, {
        actorUserId: actor.id,
        action: 'note.edit',
        entityType: 'note',
        entityId: noteId,
        before: { body: before.body },
        after: { body: patch.body },
      });
    }

    const [entry] = await tx
      .select()
      .from(timeEntries)
      .where(
        and(eq(timeEntries.noteId, noteId), isNull(timeEntries.deletedAt)),
      );
    if (patch.minutes === undefined) return entry?.minutes ?? null;

    const recorded = roundUpToUnit(patch.minutes);
    if (entry) {
      if (entry.minutes !== recorded) {
        await tx
          .update(timeEntries)
          .set({ minutes: recorded, updatedAt: new Date() })
          .where(eq(timeEntries.id, entry.id));
        await recordAudit(tx, {
          actorUserId: actor.id,
          action: 'time.edit',
          entityType: 'time_entry',
          entityId: entry.id,
          before: { minutes: entry.minutes },
          after: { minutes: recorded },
        });
      }
    } else {
      const [created] = await tx
        .insert(timeEntries)
        .values({
          caseId: before.caseId,
          userId: before.authorUserId,
          entryDate: before.entryDate,
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
        after: {
          caseId: before.caseId,
          noteId,
          entryDate: before.entryDate,
          minutes: recorded,
        },
      });
    }
    return recorded;
  });

  const [row] = await db
    .select()
    .from(caseNotes)
    .where(eq(caseNotes.id, noteId));
  return {
    item: {
      id: row!.id,
      type: 'note',
      kind: row!.kind as NoteKind,
      occurredOn: row!.entryDate,
      createdAt: row!.createdAt.toISOString(),
      authorUserId: row!.authorUserId,
      authorName: null,
      body: row!.body,
      canEdit: true,
      edited:
        (patch.body !== undefined && patch.body !== before.body) ||
        row!.updatedAt.getTime() - row!.createdAt.getTime() > 1000,
      minutes,
    },
    caseId: row!.caseId,
  };
}

/**
 * Delete a note (and, for a billable, its time). Soft and audited; allowed for
 * its author or an admin. Returns the case id, or null if there was no note.
 */
export async function deleteNote(
  noteId: string,
  actor: Actor,
): Promise<{ caseId: string } | null> {
  const note = await loadEditable(noteId, actor);
  if (!note) return null;
  const now = new Date();
  await getDb().transaction(async (tx) => {
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
  });
  return { caseId: note.caseId };
}
