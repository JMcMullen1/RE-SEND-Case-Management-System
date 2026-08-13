import { eq } from 'drizzle-orm';
import type { NoteKind, NoteTimelineItem } from '@re-send/shared';
import { getDb } from '../db/client';
import { caseNotes } from '../db/schema';
import { recordAudit } from './audit';

export class NoteForbidden extends Error {}

interface Actor {
  id: string;
  displayName: string;
  role: string;
}

export async function addNote(
  caseId: string,
  body: string,
  kind: NoteKind,
  entryDate: string,
  actor: Actor,
): Promise<NoteTimelineItem> {
  const db = getDb();
  const [row] = await db
    .insert(caseNotes)
    .values({ caseId, body, kind, entryDate, authorUserId: actor.id })
    .returning();
  await recordAudit(db, {
    actorUserId: actor.id,
    action: 'note.create',
    entityType: 'note',
    entityId: row!.id,
    after: { caseId, entryDate, kind },
  });
  return {
    id: row!.id,
    type: 'note',
    kind: row!.kind as NoteKind,
    occurredOn: row!.entryDate,
    createdAt: row!.createdAt.toISOString(),
    authorUserId: actor.id,
    authorName: actor.displayName,
    body: row!.body,
    canEdit: true,
    edited: false,
  };
}

/** Edit a note. Allowed for its author or an admin; the edit is audited. */
export async function editNote(
  noteId: string,
  body: string,
  actor: Actor,
): Promise<{ item: NoteTimelineItem; caseId: string } | null> {
  const db = getDb();
  const [before] = await db
    .select()
    .from(caseNotes)
    .where(eq(caseNotes.id, noteId));
  if (!before || before.deletedAt) return null;

  const isAuthor = before.authorUserId === actor.id;
  if (!isAuthor && actor.role !== 'admin') {
    throw new NoteForbidden('Only the author or an admin may edit this note.');
  }

  const now = new Date();
  const [row] = await db
    .update(caseNotes)
    .set({ body, updatedAt: now })
    .where(eq(caseNotes.id, noteId))
    .returning();
  await recordAudit(db, {
    actorUserId: actor.id,
    action: 'note.edit',
    entityType: 'note',
    entityId: noteId,
    before: { body: before.body },
    after: { body },
  });
  return {
    item: {
      id: row!.id,
      type: 'note',
      kind: row!.kind as NoteKind,
      occurredOn: row!.entryDate,
      createdAt: row!.createdAt.toISOString(),
      authorUserId: row!.authorUserId,
      authorName: actor.displayName,
      body: row!.body,
      canEdit: true,
      edited: true,
    },
    caseId: row!.caseId,
  };
}
