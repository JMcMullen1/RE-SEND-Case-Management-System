import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { provisionDemoAccounts } from '../auth/demo-accounts';
import { resolveActingUser } from '../auth/context';
import { resetDemoData } from '../repositories/demo';
import { env } from '../env';

/**
 * Demonstration controls, available only when DEMO_MODE is on. The reset empties
 * every case-data table back to a blank case list so a walkthrough can be run
 * again from scratch, then re-provisions the demo accounts so sign-in still
 * works. Off-demo the route does not exist in any meaningful sense — it 404s.
 */
export function registerDemoRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/demo/reset',
    {
      config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
      schema: {
        response: {
          200: z.object({ ok: z.literal(true) }),
          401: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      if (!env.DEMO_MODE) return reply.code(404).send({ message: 'Not found' });
      // Must be signed in — resetting the whole demo is not anonymous.
      const user = await resolveActingUser(request);
      if (!user) return reply.code(401).send({ message: 'Not signed in' });

      await resetDemoData();
      await provisionDemoAccounts();
      request.log.info({ actor: user.id }, 'demo data reset');
      return { ok: true as const };
    },
  );
}
