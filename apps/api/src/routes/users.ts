import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { resolveActingUser } from '../auth/context';
import { listActiveUsers } from '../repositories/users';
import { UserSummarySchema } from './schemas';

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
          401: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const user = await resolveActingUser(request);
      if (!user) return reply.code(401).send({ message: 'Not signed in' });
      return user;
    },
  );
}
