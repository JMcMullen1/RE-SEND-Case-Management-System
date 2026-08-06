import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  DEMO_ACCOUNTS,
  demoPasswordMatches,
  demoUserByEmail,
} from '../auth/demo-accounts';
import { SESSION_COOKIE, signSession } from '../auth/session';
import { resolveActingUser } from '../auth/context';
import { env } from '../env';
import { UserSummarySchema } from './schemas';

const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

function setSession(reply: FastifyReply, userId: string): void {
  reply.setCookie(SESSION_COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

/**
 * Authentication. Under DEMO_MODE this is local password login for the named
 * demo accounts, so the system can be shown without a Microsoft tenant. When
 * DEMO_MODE is off the login endpoint is disabled — real single sign-on is a
 * separate concern and login here would be a false sense of security.
 */
export function registerAuthRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // The accounts a demo can sign in as (never the password). Empty off-demo.
  app.get(
    '/api/auth/accounts',
    {
      schema: {
        response: {
          200: z.object({
            demoMode: z.boolean(),
            accounts: z.array(
              z.object({ email: z.string(), displayName: z.string() }),
            ),
          }),
        },
      },
    },
    async () => ({
      demoMode: env.DEMO_MODE,
      accounts: env.DEMO_MODE
        ? DEMO_ACCOUNTS.map((a) => ({
            email: a.email,
            displayName: a.displayName,
          }))
        : [],
    }),
  );

  app.post(
    '/api/auth/login',
    {
      // Rate-limited: brute-forcing the shared demo password is the obvious
      // abuse. See buildServer's per-route rate-limit config.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: z.object({
          email: z.string().min(1),
          password: z.string().min(1),
        }),
        response: {
          200: UserSummarySchema,
          401: z.object({ message: z.string() }),
          403: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      if (!env.DEMO_MODE)
        return reply
          .code(403)
          .send({ message: 'Password login is only available in demo mode.' });

      const { email, password } = request.body;
      if (!demoPasswordMatches(password))
        return reply
          .code(401)
          .send({ message: 'Incorrect email or password.' });
      const user = await demoUserByEmail(email);
      if (!user)
        return reply
          .code(401)
          .send({ message: 'Incorrect email or password.' });

      setSession(reply, user.id);
      return {
        id: user.id,
        displayName: user.displayName,
        role: user.role,
        active: true,
      };
    },
  );

  app.post(
    '/api/auth/logout',
    { schema: { response: { 200: z.object({ ok: z.literal(true) }) } } },
    async (_request, reply) => {
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return { ok: true as const };
    },
  );

  // Current session — 401 when unauthenticated (the UI shows the sign-in form).
  app.get(
    '/api/auth/session',
    {
      schema: {
        response: {
          200: UserSummarySchema,
          401: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const user = await resolveActingUser(request);
      if (!user) return reply.code(401).send({ message: 'Not signed in.' });
      return user;
    },
  );
}
