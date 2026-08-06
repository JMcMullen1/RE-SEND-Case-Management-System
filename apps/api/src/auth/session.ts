import { createHmac, timingSafeEqual } from 'node:crypto';
import { sessionSecret } from '../env';

export const SESSION_COOKIE = 'resend_session';

/**
 * Session tokens are `<userId>.<hmac>`, signed with SESSION_SECRET. There is no
 * server-side session store — the cookie is self-authenticating and httpOnly.
 * It carries only the user id (an opaque UUID), never personal data.
 */
export function signSession(userId: string): string {
  const sig = createHmac('sha256', sessionSecret())
    .update(userId)
    .digest('base64url');
  return `${userId}.${sig}`;
}

/** Verify a session token, returning the user id it attests, or null. */
export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const expected = createHmac('sha256', sessionSecret())
    .update(userId)
    .digest('base64url');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? userId : null;
}
