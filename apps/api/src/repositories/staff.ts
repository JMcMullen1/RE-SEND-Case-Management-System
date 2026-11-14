import { and, asc, eq, notInArray, sql } from 'drizzle-orm';
import {
  CLOSED_CASE_STATUSES,
  canOwnCases,
  normaliseEmail,
  staffChangeProblem,
  type OwnerQueue,
  type StaffMember,
  type UserRole,
} from '@re-send/shared';
import { getDb } from '../db/client';
import { cases, users } from '../db/schema';
import { recordAudit } from './audit';

export class StaffNotFound extends Error {}
export class StaffConflict extends Error {}
export class StaffRuleBroken extends Error {}

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const openCase = notInArray(cases.status, [...CLOSED_CASE_STATUSES]);

/** Everyone with an account, active first, with the open cases each owns. */
export async function listStaff(): Promise<StaffMember[]> {
  return getDb()
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      role: users.role,
      active: users.active,
      openCaseCount: sql<number>`(
        SELECT count(*)::int FROM ${cases} c
        WHERE c.owner_user_id = ${sql.raw('"users"."id"')}
          AND c.deleted_at IS NULL
          AND c.status::text NOT IN (${sql.join(
            CLOSED_CASE_STATUSES.map((s) => sql`${s}`),
            sql`, `,
          )})
      )`,
    })
    .from(users)
    .orderBy(sql`${users.active} DESC`, asc(users.displayName));
}

async function getStaff(id: string): Promise<StaffMember> {
  const member = (await listStaff()).find((m) => m.id === id);
  if (!member) throw new StaffNotFound('Person not found');
  return member;
}

/** Lock the active admins and return how many there are (serialises admin changes). */
async function lockActiveAdmins(tx: Tx): Promise<number> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.active, true)))
    .for('update');
  return rows.length;
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === '23505';
}

const EMAIL_IN_USE = 'Someone already has an account with this email address.';

/** Add a member of staff (a joiner). Audited. */
export async function createStaff(
  input: { displayName: string; email: string; role: UserRole },
  actor: string,
): Promise<StaffMember> {
  const email = normaliseEmail(input.email);
  let id: string;
  try {
    id = await getDb().transaction(async (tx) => {
      const [clash] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`);
      if (clash) throw new StaffConflict(EMAIL_IN_USE);
      const [row] = await tx
        .insert(users)
        .values({
          displayName: input.displayName.trim(),
          email,
          role: input.role,
          active: true,
        })
        .returning({ id: users.id });
      await recordAudit(tx, {
        actorUserId: actor,
        action: 'staff.create',
        entityType: 'user',
        entityId: row!.id,
        after: { role: input.role },
      });
      return row!.id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new StaffConflict(EMAIL_IN_USE);
    throw err;
  }
  return getStaff(id);
}

/** Change a person's name, email or role. Audited; admin rules enforced. */
export async function updateStaff(
  id: string,
  patch: { displayName?: string; email?: string; role?: UserRole },
  actor: string,
): Promise<StaffMember> {
  try {
    await getDb().transaction(async (tx) => {
      const activeAdmins = await lockActiveAdmins(tx);
      const [before] = await tx
        .select()
        .from(users)
        .where(eq(users.id, id))
        .for('update');
      if (!before) throw new StaffNotFound('Person not found');
      const problem = staffChangeProblem({
        actorId: actor,
        target: before,
        change: { role: patch.role },
        activeAdmins,
      });
      if (problem) throw new StaffRuleBroken(problem);

      const next: Record<string, string> = {};
      if (patch.displayName !== undefined)
        next.displayName = patch.displayName.trim();
      if (patch.email !== undefined) {
        const email = normaliseEmail(patch.email);
        const [clash] = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              sql`lower(${users.email}) = ${email}`,
              sql`${users.id} <> ${id}`,
            ),
          );
        if (clash) throw new StaffConflict(EMAIL_IN_USE);
        next.email = email;
      }
      if (patch.role !== undefined) next.role = patch.role;
      const before_: Record<string, unknown> = {};
      for (const k of Object.keys(next)) {
        const prior = (before as Record<string, unknown>)[k];
        if (prior === next[k]) delete next[k];
        else before_[k] = prior;
      }
      if (Object.keys(next).length === 0) return;
      await tx
        .update(users)
        .set({ ...next, updatedAt: new Date() })
        .where(eq(users.id, id));
      await recordAudit(tx, {
        actorUserId: actor,
        action: 'staff.edit',
        entityType: 'user',
        entityId: id,
        before: before_,
        after: next,
      });
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new StaffConflict(EMAIL_IN_USE);
    throw err;
  }
  return getStaff(id);
}

export type Handover =
  | { kind: 'queue'; queue: OwnerQueue }
  | { kind: 'user'; userId: string }
  | { kind: 'none' };

/**
 * Mark a leaver. They can no longer sign in (their session stops working on
 * its next request) and drop out of every staff picker. Their open cases are
 * handed to a queue or a colleague if asked — each reassignment audited like
 * any other — and they are removed as dealing shadow on open cases. Their
 * history (notes, time, approvals) stays attributed to them.
 */
export async function deactivateStaff(
  id: string,
  handover: Handover,
  actor: string,
): Promise<{ member: StaffMember; casesHandedOver: number }> {
  let handed = 0;
  await getDb().transaction(async (tx) => {
    const activeAdmins = await lockActiveAdmins(tx);
    const [before] = await tx
      .select()
      .from(users)
      .where(eq(users.id, id))
      .for('update');
    if (!before) throw new StaffNotFound('Person not found');
    if (!before.active) return;
    if (id === actor)
      throw new StaffRuleBroken('You cannot mark yourself as having left.');
    const problem = staffChangeProblem({
      actorId: actor,
      target: before,
      change: { active: false },
      activeAdmins,
    });
    if (problem) throw new StaffRuleBroken(problem);

    if (handover.kind === 'user') {
      // Locked, so the colleague cannot be marked as left at the same moment.
      const [to] = await tx
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(and(eq(users.id, handover.userId), eq(users.active, true)))
        .for('update');
      if (!to || to.id === id || !canOwnCases(to.role))
        throw new StaffRuleBroken(
          'Choose an active caseworker or admin to hand the cases to.',
        );
    }

    await tx
      .update(users)
      // Signed out, and their calendar feed URL stops working.
      .set({ active: false, icalToken: null, updatedAt: new Date() })
      .where(eq(users.id, id));
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'staff.deactivate',
      entityType: 'user',
      entityId: id,
      after: { handover: handover.kind },
    });

    if (handover.kind !== 'none') {
      const target =
        handover.kind === 'queue'
          ? { ownerUserId: null, ownerQueue: handover.queue }
          : { ownerUserId: handover.userId, ownerQueue: null };
      const moved = await tx
        .update(cases)
        .set({ ...target, updatedAt: new Date() })
        .where(
          and(
            eq(cases.ownerUserId, id),
            openCase,
            sql`${cases.deletedAt} IS NULL`,
          ),
        )
        .returning({ id: cases.id });
      for (const c of moved) {
        await recordAudit(tx, {
          actorUserId: actor,
          action: 'case.reassign_owner',
          entityType: 'case',
          entityId: c.id,
          before: { ownerUserId: id, ownerQueue: null },
          after: { ...target, reason: 'leaver' },
        });
      }
      handed = moved.length;
    }

    const unshadowed = await tx
      .update(cases)
      .set({ shadowUserId: null, updatedAt: new Date() })
      .where(
        and(
          eq(cases.shadowUserId, id),
          openCase,
          sql`${cases.deletedAt} IS NULL`,
        ),
      )
      .returning({ id: cases.id });
    for (const c of unshadowed) {
      await recordAudit(tx, {
        actorUserId: actor,
        action: 'case.edit',
        entityType: 'case',
        entityId: c.id,
        before: { shadowUserId: id },
        after: { shadowUserId: null, reason: 'leaver' },
      });
    }
  });
  return { member: await getStaff(id), casesHandedOver: handed };
}

/** Bring a leaver back (e.g. marked in error, or rejoining). Audited. */
export async function reactivateStaff(
  id: string,
  actor: string,
): Promise<StaffMember> {
  await getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(users)
      .set({ active: true, updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.active, false)))
      .returning({ id: users.id });
    if (!row) return;
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'staff.reactivate',
      entityType: 'user',
      entityId: id,
    });
  });
  return getStaff(id);
}
