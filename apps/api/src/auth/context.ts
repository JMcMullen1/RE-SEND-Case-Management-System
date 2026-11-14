import type { FastifyRequest } from 'fastify';
import {
  getActiveUserById,
  listActiveUsers,
  type UserSummary,
} from '../repositories/users';
import { isSignInEnforced } from './gate';
import { SESSION_COOKIE, verifySession } from './session';

/**
 * Resolve the acting user for a request, in priority order:
 *
 * 1. a valid signed session cookie (the real path once signed in);
 * 2. local development and tests only: the `x-user-id` header;
 * 3. local development and tests only: the first active user, so the app is
 *    usable before authentication exists.
 *
 * Where sign-in is enforced (DEMO_MODE or production) only the session counts;
 * there is no header and no fallback.
 */
export async function resolveActingUser(
  request: FastifyRequest,
): Promise<UserSummary | null> {
  const cookies = (request as { cookies?: Record<string, string> }).cookies;
  const sessionUserId = verifySession(cookies?.[SESSION_COOKIE]);
  if (sessionUserId) return getActiveUserById(sessionUserId);

  // Where sign-in is enforced (demo and production) only a session counts:
  // trusting a header there would let anyone act as anyone, admins included.
  if (isSignInEnforced()) return null;

  const header = request.headers['x-user-id'];
  const headerId = typeof header === 'string' ? header : undefined;
  if (headerId) return getActiveUserById(headerId);

  const active = await listActiveUsers();
  return active[0] ?? null;
}

/** Just the id, for the many call sites that only need the actor. */
export async function actingUserId(
  request: FastifyRequest,
): Promise<string | null> {
  return (await resolveActingUser(request))?.id ?? null;
}
