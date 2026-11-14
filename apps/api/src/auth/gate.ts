import type { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from '../env';
import { getActiveUserById } from '../repositories/users';
import { SESSION_COOKIE, verifySession } from './session';

/**
 * Sign-in is enforced wherever real people use the system: the demo deployment
 * (DEMO_MODE) and production. Only local development and the test suite run
 * without it, so the app is usable before single sign-on exists.
 */
export function isSignInEnforced(): boolean {
  return env.DEMO_MODE || env.NODE_ENV === 'production';
}

/** API paths reachable without a session. Everything else under /api needs one. */
function isPublicApiPath(path: string): boolean {
  return (
    path.startsWith('/api/auth/') ||
    // The iCal feed authenticates with its own per-user token in the URL.
    /^\/api\/calendar\/feed\/[^/]+\.ics$/.test(path)
  );
}

/** The signed-in user's id from the session cookie, if it names an active user. */
export async function sessionUserId(
  request: FastifyRequest,
): Promise<string | null> {
  const cookies = (request as { cookies?: Record<string, string> }).cookies;
  const id = verifySession(cookies?.[SESSION_COOKIE]);
  if (!id) return null;
  return (await getActiveUserById(id))?.id ?? null;
}

/**
 * Refuse every non-public /api request (the live-updates WebSocket included)
 * that does not carry a valid session for an active user. The data is special
 * category data about children: nothing is served to an anonymous caller.
 * The front end and health checks are outside /api and unaffected.
 */
export function registerSessionGate(app: FastifyInstance): void {
  if (!isSignInEnforced()) return;
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0]!;
    if (!path.startsWith('/api/') || isPublicApiPath(path)) return;
    if (await sessionUserId(request)) return;
    return reply.code(401).send({ message: 'Not signed in.' });
  });
}
