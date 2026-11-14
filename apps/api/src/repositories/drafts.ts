import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  DRAFT_GENERATION_TIMEOUT_MINUTES,
  type Draft,
  type DraftKind,
  type DraftParagraph,
  type DraftSection,
  type DraftSource,
  type DraftStatus,
  type GroundedDraft,
} from '@re-send/shared';
import { alias } from 'drizzle-orm/pg-core';
import { getDb } from '../db/client';
import { drafts, users } from '../db/schema';
import { recordAudit } from './audit';

export class DraftNotFound extends Error {}
export class DraftLocked extends Error {}
export class DraftConflict extends Error {}

/** What is stored in `drafts.content`. */
type DraftContent = GroundedDraft;

const creator = alias(users, 'draft_creator');
const approver = alias(users, 'draft_approver');

function rowsQuery() {
  return getDb()
    .select({
      id: drafts.id,
      caseId: drafts.caseId,
      kind: drafts.kind,
      status: drafts.status,
      instructions: drafts.instructions,
      content: drafts.content,
      failureReason: drafts.failureReason,
      createdByName: creator.displayName,
      createdAt: drafts.createdAt,
      updatedAt: drafts.updatedAt,
      approvedByName: approver.displayName,
      approvedAt: drafts.approvedAt,
      documentId: drafts.documentId,
    })
    .from(drafts)
    .leftJoin(creator, eq(creator.id, drafts.createdByUserId))
    .leftJoin(approver, eq(approver.id, drafts.approvedByUserId));
}

type Row = Awaited<ReturnType<typeof rowsQuery>>[number];

function toDraft(r: Row, now: Date): Draft {
  const content = (r.content ?? null) as DraftContent | null;
  // A draft the server stopped writing (e.g. a restart) would otherwise spin
  // for ever; past the timeout it is shown as failed so it can be retried.
  const stale =
    r.status === 'generating' &&
    now.getTime() - r.createdAt.getTime() >
      DRAFT_GENERATION_TIMEOUT_MINUTES * 60_000;
  return {
    id: r.id,
    caseId: r.caseId,
    kind: r.kind,
    status: stale ? 'failed' : r.status,
    instructions: r.instructions,
    sections: content?.sections ?? [],
    missingInformation: content?.missingInformation ?? [],
    sources: content?.sources ?? [],
    removedUnsupported: content?.removedUnsupported ?? 0,
    failureReason: stale
      ? 'Drafting took too long and was stopped. Try again.'
      : r.failureReason,
    createdByName: r.createdByName,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    approvedByName: r.approvedByName,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    documentId: r.documentId,
  };
}

/** Every live draft on a case, newest first. */
export async function listDrafts(caseId: string): Promise<Draft[]> {
  const rows = await rowsQuery()
    .where(and(eq(drafts.caseId, caseId), isNull(drafts.deletedAt)))
    .orderBy(desc(drafts.createdAt));
  const now = new Date();
  return rows.map((r) => toDraft(r, now));
}

export async function getDraft(id: string): Promise<Draft | null> {
  const [row] = await rowsQuery().where(
    and(eq(drafts.id, id), isNull(drafts.deletedAt)),
  );
  return row ? toDraft(row, new Date()) : null;
}

/** Start a draft: recorded as "generating" before the model is asked. */
export async function createDraft(
  caseId: string,
  kind: DraftKind,
  instructions: string | null,
  actor: string,
): Promise<string> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .insert(drafts)
      .values({
        caseId,
        kind,
        status: 'generating',
        instructions,
        createdByUserId: actor,
      })
      .returning({ id: drafts.id });
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'draft.request',
      entityType: 'draft',
      entityId: row!.id,
      after: { caseId, kind },
    });
    return row!.id;
  });
}

/**
 * The model's grounded draft is ready for review. Only a draft still within
 * its time limit is completed: one already shown as failed (and perhaps
 * retried) is never brought back to life by a late answer. Audited with no
 * actor (the system wrote it). Returns false when it was too late.
 */
export async function completeDraft(
  id: string,
  content: DraftContent,
): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const done = await tx
      .update(drafts)
      .set({ status: 'ready', content, updatedAt: new Date() })
      .where(
        and(
          eq(drafts.id, id),
          eq(drafts.status, 'generating'),
          sql`${drafts.createdAt} > now() - make_interval(mins => ${DRAFT_GENERATION_TIMEOUT_MINUTES})`,
        ),
      )
      .returning({ caseId: drafts.caseId });
    if (!done[0]) return false;
    await recordAudit(tx, {
      actorUserId: null,
      action: 'draft.ready',
      entityType: 'draft',
      entityId: id,
      after: {
        caseId: done[0].caseId,
        paragraphs: content.sections.reduce(
          (n, s) => n + s.paragraphs.length,
          0,
        ),
        removedUnsupported: content.removedUnsupported,
      },
    });
    return true;
  });
}

/** Drafting failed; the reason is shown to the caseworker (no case content). */
export async function failDraft(id: string, reason: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const done = await tx
      .update(drafts)
      .set({ status: 'failed', failureReason: reason, updatedAt: new Date() })
      .where(and(eq(drafts.id, id), eq(drafts.status, 'generating')))
      .returning({ caseId: drafts.caseId });
    if (!done[0]) return;
    await recordAudit(tx, {
      actorUserId: null,
      action: 'draft.failed',
      entityType: 'draft',
      entityId: id,
      after: { caseId: done[0].caseId },
    });
  });
}

/** A paragraph as the editor sends it back. */
export interface ParagraphEdit {
  /** An existing paragraph's id; omitted for one the caseworker adds. */
  id?: string;
  text: string;
}

/**
 * Save a caseworker's edits to a ready draft. Paragraph text can be changed,
 * removed, reordered within its section, or added; citations stay as the model
 * grounded them (an added paragraph is the caseworker's own and cites
 * nothing). Approved drafts are locked. Audited with counts, not content.
 */
export async function saveDraftEdits(
  id: string,
  edits: { key: string; paragraphs: ParagraphEdit[] }[],
  baseUpdatedAt: string,
  actor: string,
): Promise<Draft> {
  await getDb().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(drafts)
      .where(and(eq(drafts.id, id), isNull(drafts.deletedAt)))
      .for('update');
    if (!row) throw new DraftNotFound('Draft not found');
    if (row.status !== 'ready')
      throw new DraftLocked(
        row.status === 'approved'
          ? 'This draft has been approved and can no longer be changed.'
          : 'This draft is not ready to edit.',
      );
    if (row.updatedAt.toISOString() !== baseUpdatedAt)
      throw new DraftConflict(
        'Someone else has changed this draft since you opened it. Copy any wording you want to keep, then reload the draft.',
      );
    const content = row.content as DraftContent;
    let changed = 0;
    const sections: DraftSection[] = content.sections.map((section) => {
      const edit = edits.find((e) => e.key === section.key);
      if (!edit) return section;
      const before = new Map(section.paragraphs.map((p) => [p.id, p]));
      const paragraphs: DraftParagraph[] = [];
      for (const p of edit.paragraphs) {
        const text = p.text.trim();
        if (!text) continue;
        const prior = p.id ? before.get(p.id) : undefined;
        if (prior) {
          const edited = prior.edited || prior.text !== text;
          if (prior.text !== text) changed += 1;
          paragraphs.push({ ...prior, text, edited });
        } else {
          changed += 1;
          paragraphs.push({
            id: randomUUID(),
            text,
            sourceIds: [],
            edited: true,
          });
        }
      }
      changed += [...before.keys()].filter(
        (pid) => !paragraphs.some((p) => p.id === pid),
      ).length;
      return { ...section, paragraphs };
    });
    // Sources no paragraph cites any more are dropped from the list.
    const stillCited = new Set(
      sections.flatMap((s) => s.paragraphs.flatMap((p) => p.sourceIds)),
    );
    const sources: DraftSource[] = content.sources.filter((s) =>
      stillCited.has(s.id),
    );
    await tx
      .update(drafts)
      .set({
        content: { ...content, sections, sources },
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, id));
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'draft.edit',
      entityType: 'draft',
      entityId: id,
      after: { caseId: row.caseId, paragraphsChanged: changed },
    });
  });
  return (await getDraft(id))!;
}

/**
 * Approve a ready draft and file it, in two steps so it is filed exactly once:
 * first the approval is claimed (locked, approver and time recorded, audited),
 * then `fileDocument` files the statement and its id is kept on the draft. If
 * filing fails, the claim is undone (audited) and the draft is ready again;
 * a second approval can never start while the first is filing, because the
 * draft is no longer "ready".
 */
export async function approveDraft(
  id: string,
  actor: string,
  fileDocument: (draft: Draft) => Promise<string>,
): Promise<Draft> {
  const db = getDb();
  const caseId = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        status: drafts.status,
        caseId: drafts.caseId,
        content: drafts.content,
      })
      .from(drafts)
      .where(and(eq(drafts.id, id), isNull(drafts.deletedAt)))
      .for('update');
    if (!row) throw new DraftNotFound('Draft not found');
    if (row.status !== 'ready')
      throw new DraftLocked(
        row.status === 'approved'
          ? 'This draft has already been approved.'
          : 'This draft is not ready to approve.',
      );
    const content = row.content as DraftContent;
    if (content.sections.every((s) => s.paragraphs.length === 0))
      throw new DraftLocked('There is nothing in this draft to approve.');
    const now = new Date();
    await tx
      .update(drafts)
      .set({
        status: 'approved' satisfies DraftStatus,
        approvedByUserId: actor,
        approvedAt: now,
        updatedAt: now,
      })
      .where(eq(drafts.id, id));
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'draft.approve',
      entityType: 'draft',
      entityId: id,
      after: { caseId: row.caseId },
    });
    return row.caseId;
  });

  let documentId: string;
  try {
    documentId = await fileDocument((await getDraft(id))!);
  } catch (err) {
    await db.transaction(async (tx) => {
      await tx
        .update(drafts)
        .set({
          status: 'ready',
          approvedByUserId: null,
          approvedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(drafts.id, id));
      await recordAudit(tx, {
        actorUserId: actor,
        action: 'draft.approve_undone',
        entityType: 'draft',
        entityId: id,
        after: { caseId, reason: 'filing failed' },
      });
    });
    throw err;
  }
  await db.transaction(async (tx) => {
    await tx.update(drafts).set({ documentId }).where(eq(drafts.id, id));
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'draft.file',
      entityType: 'draft',
      entityId: id,
      after: { caseId, documentId },
    });
  });
  return (await getDraft(id))!;
}

/** Discard a draft that has not been approved (soft, audited). */
export async function deleteDraft(id: string, actor: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ status: drafts.status, caseId: drafts.caseId })
      .from(drafts)
      .where(and(eq(drafts.id, id), isNull(drafts.deletedAt)))
      .for('update');
    if (!row) throw new DraftNotFound('Draft not found');
    if (row.status === 'approved')
      throw new DraftLocked(
        'An approved draft is part of the case record and cannot be discarded.',
      );
    await tx
      .update(drafts)
      .set({ deletedAt: new Date() })
      .where(eq(drafts.id, id));
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'draft.delete',
      entityType: 'draft',
      entityId: id,
      before: { caseId: row.caseId, status: row.status },
    });
  });
}
