import { and, asc, eq, isNull } from 'drizzle-orm';
import type { KeyDateFull } from '@re-send/shared';
import { getDb } from '../db/client';
import { keyDates } from '../db/schema';
import { recordAudit } from './audit';

function toFull(k: typeof keyDates.$inferSelect): KeyDateFull {
  return {
    id: k.id,
    date: k.date,
    time: k.time,
    title: k.title,
    description: k.description,
    type: k.type,
    source: k.source,
    confidence: k.confidence,
    sourceReference: k.sourceReference,
  };
}

export async function listKeyDates(caseId: string): Promise<KeyDateFull[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(keyDates)
    .where(
      and(
        eq(keyDates.caseId, caseId),
        isNull(keyDates.deletedAt),
        isNull(keyDates.supersededAt),
      ),
    )
    .orderBy(asc(keyDates.date));
  return rows.map(toFull);
}

export type KeyDateInput = Pick<
  typeof keyDates.$inferInsert,
  | 'date'
  | 'time'
  | 'title'
  | 'description'
  | 'type'
  | 'source'
  | 'confidence'
  | 'sourceReference'
>;

export async function createKeyDate(
  caseId: string,
  input: KeyDateInput,
  actor: string | null,
): Promise<KeyDateFull> {
  const db = getDb();
  const [row] = await db
    .insert(keyDates)
    .values({ ...input, caseId, source: input.source ?? 'manual' })
    .returning();
  await recordAudit(db, {
    actorUserId: actor,
    action: 'key_date.create',
    entityType: 'key_date',
    entityId: row!.id,
    after: { caseId, date: input.date, type: input.type, title: input.title },
  });
  return toFull(row!);
}

export async function updateKeyDate(
  id: string,
  patch: Partial<KeyDateInput>,
  actor: string | null,
): Promise<{ keyDate: KeyDateFull; caseId: string } | null> {
  const db = getDb();
  const [before] = await db.select().from(keyDates).where(eq(keyDates.id, id));
  if (!before) return null;
  const [row] = await db
    .update(keyDates)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(keyDates.id, id))
    .returning();
  await recordAudit(db, {
    actorUserId: actor,
    action: 'key_date.update',
    entityType: 'key_date',
    entityId: id,
    before: {
      date: before.date,
      time: before.time,
      title: before.title,
      type: before.type,
    },
    after: patch,
  });
  return { keyDate: toFull(row!), caseId: row!.caseId };
}

export async function deleteKeyDate(
  id: string,
  actor: string | null,
): Promise<{ caseId: string } | null> {
  const db = getDb();
  const [before] = await db.select().from(keyDates).where(eq(keyDates.id, id));
  if (!before || before.deletedAt) return null;
  await db
    .update(keyDates)
    .set({ deletedAt: new Date() })
    .where(eq(keyDates.id, id));
  await recordAudit(db, {
    actorUserId: actor,
    action: 'key_date.delete',
    entityType: 'key_date',
    entityId: id,
    before: { date: before.date, type: before.type, title: before.title },
  });
  return { caseId: before.caseId };
}
