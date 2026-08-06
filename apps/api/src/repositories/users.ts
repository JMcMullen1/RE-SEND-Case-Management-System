import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { users } from '../db/schema';

export interface UserSummary {
  id: string;
  displayName: string;
  role: string;
  active: boolean;
}

/** Resolve one active user by id, or null. Used to validate a session. */
export async function getActiveUserById(
  id: string,
): Promise<UserSummary | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      role: users.role,
      active: users.active,
    })
    .from(users)
    .where(and(eq(users.id, id), eq(users.active, true)));
  return row ?? null;
}

/** Active users only — the source of every staff-picking control. */
export async function listActiveUsers(): Promise<UserSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      role: users.role,
      active: users.active,
    })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.displayName));
  return rows;
}

/**
 * Resolve the acting user. Auth is not built yet; the API accepts an
 * `x-user-id` header in development and otherwise falls back to the first
 * active user so "Mine" and audit attribution have someone to point at.
 */
export async function resolveCurrentUser(
  headerUserId: string | undefined,
): Promise<UserSummary | null> {
  const db = getDb();
  if (headerUserId) {
    const [row] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        role: users.role,
        active: users.active,
      })
      .from(users)
      .where(eq(users.id, headerUserId));
    if (row) return row;
  }
  const active = await listActiveUsers();
  return active[0] ?? null;
}
