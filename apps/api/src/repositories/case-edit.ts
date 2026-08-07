import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Team } from '@re-send/shared';
import { getDb } from '../db/client';
import { caseTeams, cases, children, clients, teams } from '../db/schema';
import { recordAudit } from './audit';

function subset(
  row: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  return Object.fromEntries(keys.map((k) => [k, row[k]]));
}

export async function updateCaseFields(
  id: string,
  patch: Partial<typeof cases.$inferInsert>,
  actor: string | null,
): Promise<boolean> {
  const db = getDb();
  let ok = false;
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(cases).where(eq(cases.id, id));
    if (!before) return;
    await tx
      .update(cases)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(cases.id, id));
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'case.update',
      entityType: 'case',
      entityId: id,
      before: subset(before, Object.keys(patch)),
      after: patch,
    });
    ok = true;
  });
  return ok;
}

export async function updateClientFields(
  id: string,
  patch: Partial<typeof clients.$inferInsert>,
  actor: string | null,
): Promise<boolean> {
  const db = getDb();
  let ok = false;
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(clients).where(eq(clients.id, id));
    if (!before) return;
    await tx
      .update(clients)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(clients.id, id));
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'client.update',
      entityType: 'client',
      entityId: id,
      before: subset(before, Object.keys(patch)),
      after: patch,
    });
    ok = true;
  });
  return ok;
}

export async function updateChildFields(
  id: string,
  patch: Partial<typeof children.$inferInsert>,
  actor: string | null,
): Promise<boolean> {
  const db = getDb();
  let ok = false;
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(children)
      .where(eq(children.id, id));
    if (!before) return;
    await tx
      .update(children)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(children.id, id));
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'child.update',
      entityType: 'child',
      entityId: id,
      before: subset(before, Object.keys(patch)),
      after: patch,
    });
    ok = true;
  });
  return ok;
}

/** Replace a case's team membership with the given team codes. */
export async function setCaseTeams(
  caseId: string,
  codes: Team[],
  actor: string | null,
): Promise<boolean> {
  const db = getDb();
  let ok = false;
  await db.transaction(async (tx) => {
    const [existsRow] = await tx
      .select({ id: cases.id })
      .from(cases)
      .where(eq(cases.id, caseId));
    if (!existsRow) return;

    const before = (
      await tx
        .select({ code: teams.code })
        .from(caseTeams)
        .innerJoin(teams, eq(teams.id, caseTeams.teamId))
        .where(eq(caseTeams.caseId, caseId))
    ).map((t) => t.code);

    await tx.delete(caseTeams).where(eq(caseTeams.caseId, caseId));
    if (codes.length > 0) {
      const teamRows = await tx
        .select({ id: teams.id, code: teams.code })
        .from(teams)
        .where(inArray(teams.code, codes));
      await tx
        .insert(caseTeams)
        .values(teamRows.map((t) => ({ caseId, teamId: t.id })));
    }
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'case.set_teams',
      entityType: 'case',
      entityId: caseId,
      before: { teams: before },
      after: { teams: codes },
    });
    ok = true;
  });
  return ok;
}

export async function caseIdForClient(
  clientId: string,
): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.clientId, clientId)));
  return row?.id ?? null;
}

export async function caseIdForChild(childId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.childId, childId)));
  return row?.id ?? null;
}

export interface CaseDeletionTarget {
  caseReference: string;
  /** The client's full name — what an admin must type to confirm deletion. */
  clientName: string | null;
}

/**
 * The confirmation target for deleting a live case: the client's name (which
 * the admin must type back) plus the case reference. Null when the case does
 * not exist or is already deleted.
 */
export async function getCaseDeletionTarget(
  id: string,
): Promise<CaseDeletionTarget | null> {
  const db = getDb();
  const [row] = await db
    .select({
      caseReference: cases.caseReference,
      clientName: clients.fullName,
    })
    .from(cases)
    .leftJoin(clients, eq(clients.id, cases.clientId))
    .where(and(eq(cases.id, id), isNull(cases.deletedAt)));
  if (!row) return null;
  return {
    caseReference: row.caseReference,
    clientName: row.clientName ?? null,
  };
}

/**
 * Soft-delete a case: mark it deleted (it drops out of every list, which all
 * filter on deleted_at IS NULL) and record who did it. Recoverable and fully
 * audited — nothing is physically removed. Returns false if the case was
 * already gone.
 */
export async function softDeleteCase(
  id: string,
  actor: string | null,
): Promise<boolean> {
  const db = getDb();
  let ok = false;
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(cases)
      .where(and(eq(cases.id, id), isNull(cases.deletedAt)));
    if (!before) return;
    const deletedAt = new Date();
    await tx
      .update(cases)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(eq(cases.id, id));
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'case.delete',
      entityType: 'case',
      entityId: id,
      before: { deletedAt: before.deletedAt, status: before.status },
      after: { deletedAt },
    });
    ok = true;
  });
  return ok;
}
