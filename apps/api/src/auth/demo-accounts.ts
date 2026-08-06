import { timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { UserRole } from '@re-send/shared';
import { getDb } from '../db/client';
import { users } from '../db/schema';
import { env } from '../env';

/**
 * The named accounts available under DEMO_MODE, so the system can be shown
 * without a Microsoft tenant. These are staff accounts (the staff list is real,
 * per invariant 5); they say nothing about cases, which start empty. All share
 * DEMO_PASSWORD — this is a demonstration convenience and is refused in
 * production by assertRuntimeSafety.
 */
export interface DemoAccount {
  email: string;
  displayName: string;
  role: UserRole;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { email: 'ada@resend.demo', displayName: 'Ada Okafor', role: 'admin' },
  { email: 'ben@resend.demo', displayName: 'Ben Carter', role: 'caseworker' },
  { email: 'priya@resend.demo', displayName: 'Priya Nair', role: 'caseworker' },
  { email: 'dana@resend.demo', displayName: 'Dana Ruiz', role: 'finance' },
];

/**
 * Ensure the demo accounts exist and are active. Idempotent: safe to run on
 * every boot. Only ever called when DEMO_MODE is on.
 */
export async function provisionDemoAccounts(): Promise<void> {
  const db = getDb();
  for (const account of DEMO_ACCOUNTS) {
    await db
      .insert(users)
      .values({
        email: account.email,
        displayName: account.displayName,
        role: account.role,
        active: true,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          displayName: account.displayName,
          role: account.role,
          active: true,
        },
      });
  }
}

/** Constant-time password check against the shared demo password. */
export function demoPasswordMatches(candidate: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(env.DEMO_PASSWORD);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Resolve a demo account's user id by email (active accounts only). */
export async function demoUserByEmail(
  email: string,
): Promise<{ id: string; displayName: string; role: string } | null> {
  const db = getDb();
  const [row] = (await db.execute(
    sql`SELECT id, display_name, role FROM users
        WHERE lower(email) = lower(${email}) AND active = true LIMIT 1`,
  )) as unknown as { id: string; display_name: string; role: string }[];
  return row
    ? { id: row.id, displayName: row.display_name, role: row.role }
    : null;
}
