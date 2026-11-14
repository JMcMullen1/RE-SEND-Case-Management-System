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
  {
    email: 'abbie.holland@resend.demo',
    displayName: 'Abbie Holland',
    role: 'caseworker',
  },
  {
    email: 'alan.marsden@resend.demo',
    displayName: 'Alan Marsden',
    role: 'caseworker',
  },
  {
    email: 'anna.gunn@resend.demo',
    displayName: 'Anna Gunn',
    role: 'caseworker',
  },
  {
    email: 'jamie.mcmullen@resend.demo',
    displayName: 'Jamie McMullen',
    role: 'admin',
  },
  {
    email: 'jo.barrow@resend.demo',
    displayName: 'Jo Barrow',
    role: 'caseworker',
  },
  {
    email: 'karen.jenkinson@resend.demo',
    displayName: 'Karen Jenkinson',
    role: 'caseworker',
  },
  {
    email: 'liz.stanley@resend.demo',
    displayName: 'Liz Stanley',
    role: 'caseworker',
  },
  {
    email: 'sarah.stafford@resend.demo',
    displayName: 'Sarah Stafford',
    role: 'caseworker',
  },
];

/**
 * Ensure the demo accounts exist (created active the first time). Nothing else
 * is touched: joiners, leavers and role changes belong to the staff admin
 * screen, and a restart must never undo them. Idempotent: safe to run on every
 * boot. Only ever called when DEMO_MODE is on.
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
      // Only fills in missing accounts: once one exists, the staff admin
      // screen owns its name, role and whether it is active, so a restart
      // never undoes an admin's change (e.g. re-activating a leaver).
      .onConflictDoNothing({ target: users.email });
  }
}

/**
 * Put the named demo accounts back exactly as listed — names, roles, active —
 * for "Reset demo". With a shared demo password any visitor can sign in as an
 * admin, so a reset must undo whatever they did to the staff list (other
 * accounts an admin added are left alone).
 */
export async function restoreDemoAccounts(): Promise<void> {
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
