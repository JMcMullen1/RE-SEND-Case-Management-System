import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { listActiveUsers, resolveCurrentUser } from '../repositories/users';
import { UserSummarySchema } from './schemas';

function headerUserId(headers: Record<string, unknown>): string | undefined {
  const raw = headers['x-user-id'];
  return typeof raw === 'string' ? raw : undefined;
}

export function registerUserRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/users',
    {
      schema: {
        response: { 200: z.object({ users: z.array(UserSummarySchema) }) },
      },
    },
    async () => ({ users: await listActiveUsers() }),
  );

  app.get(
    '/api/me',
    {
      schema: {
        response: {
          200: UserSummarySchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const user = await resolveCurrentUser(headerUserId(request.headers));
      if (!user) return reply.code(404).send({ message: 'No active users' });
      return user;
    },
  );
}
