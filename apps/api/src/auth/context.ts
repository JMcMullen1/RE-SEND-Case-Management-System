import type { FastifyRequest } from 'fastify';
import { env } from '../env';
import {
  getActiveUserById,
  listActiveUsers,
  type UserSummary,
} from '../repositories/users';
import { SESSION_COOKIE, verifySession } from './session';

/**
 * Resolve the acting user for a request, in priority order:
 *
 * 1. a valid signed session cookie (the real path once signed in);
 * 2. the `x-user-id` header (kept for tests and local tooling);
 * 3. in non-demo development only, the first active user, so the app is usable
 *    before authentication exists.
 *
 * Under DEMO_MODE there is no silent fallback: a request with no valid session
 * is unauthenticated, so the UI must sign in.
 */
export async function resolveActingUser(
  request: FastifyRequest,
): Promise<UserSummary | null> {
  const cookies = (request as { cookies?: Record<string, string> }).cookies;
  const sessionUserId = verifySession(cookies?.[SESSION_COOKIE]);
  if (sessionUserId) return getActiveUserById(sessionUserId);

  const header = request.headers['x-user-id'];
  const headerId = typeof header === 'string' ? header : undefined;
  if (headerId) return getActiveUserById(headerId);

  if (!env.DEMO_MODE) {
    const active = await listActiveUsers();
    return active[0] ?? null;
  }
  return null;
}

/** Just the id, for the many call sites that only need the actor. */
export async function actingUserId(
  request: FastifyRequest,
): Promise<string | null> {
  return (await resolveActingUser(request))?.id ?? null;
}
