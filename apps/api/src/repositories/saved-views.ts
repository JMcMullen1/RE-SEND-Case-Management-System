import { and, desc, eq, isNull, or } from 'drizzle-orm';
import type { ViewState } from '@re-send/shared';
import { getDb } from '../db/client';
import { savedViews } from '../db/schema';

export interface SavedView {
  id: string;
  name: string;
  ownerUserId: string | null;
  shared: boolean;
  state: ViewState;
}

function toSavedView(row: {
  id: string;
  name: string;
  ownerUserId: string | null;
  state: unknown;
}): SavedView {
  return {
    id: row.id,
    name: row.name,
    ownerUserId: row.ownerUserId,
    shared: row.ownerUserId === null,
    state: row.state as ViewState,
  };
}

/** Shared views plus the current user's own personal views. */
export async function listSavedViews(
  currentUserId: string | null,
): Promise<SavedView[]> {
  const db = getDb();
  const ownership = currentUserId
    ? or(
        isNull(savedViews.ownerUserId),
        eq(savedViews.ownerUserId, currentUserId),
      )
    : isNull(savedViews.ownerUserId);
  const rows = await db
    .select({
      id: savedViews.id,
      name: savedViews.name,
      ownerUserId: savedViews.ownerUserId,
      state: savedViews.state,
    })
    .from(savedViews)
    .where(ownership)
    .orderBy(desc(savedViews.createdAt));
  return rows.map(toSavedView);
}

export async function createSavedView(input: {
  name: string;
  shared: boolean;
  state: ViewState;
  currentUserId: string | null;
}): Promise<SavedView> {
  const db = getDb();
  const [row] = await db
    .insert(savedViews)
    .values({
      name: input.name,
      ownerUserId: input.shared ? null : input.currentUserId,
      state: input.state,
    })
    .returning({
      id: savedViews.id,
      name: savedViews.name,
      ownerUserId: savedViews.ownerUserId,
      state: savedViews.state,
    });
  return toSavedView(row!);
}

/** Delete a view the user is allowed to remove (their own, or any shared). */
export async function deleteSavedView(
  id: string,
  currentUserId: string | null,
): Promise<boolean> {
  const db = getDb();
  const scope = currentUserId
    ? or(
        isNull(savedViews.ownerUserId),
        eq(savedViews.ownerUserId, currentUserId),
      )
    : isNull(savedViews.ownerUserId);
  const deleted = await db
    .delete(savedViews)
    .where(and(eq(savedViews.id, id), scope))
    .returning({ id: savedViews.id });
  return deleted.length > 0;
}
