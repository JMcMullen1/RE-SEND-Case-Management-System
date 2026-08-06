import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SAVED_VIEW_SEEDS } from '@re-send/shared';
import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
} from '../repositories/saved-views';
import { resolveActingUser } from '../auth/context';
import {
  SavedViewSchema,
  SavedViewSeedSchema,
  ViewStateSchema,
} from './schemas';

export function registerSavedViewRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/saved-views',
    {
      schema: {
        response: {
          200: z.object({
            seeds: z.array(SavedViewSeedSchema),
            views: z.array(SavedViewSchema),
          }),
        },
      },
    },
    async (request) => {
      const current = await resolveActingUser(request);
      const views = await listSavedViews(current?.id ?? null);
      return { seeds: SAVED_VIEW_SEEDS, views };
    },
  );

  app.post(
    '/api/saved-views',
    {
      schema: {
        body: z.object({
          name: z.string().min(1).max(120),
          shared: z.boolean(),
          state: ViewStateSchema,
        }),
        response: { 200: z.object({ view: SavedViewSchema }) },
      },
    },
    async (request) => {
      const current = await resolveActingUser(request);
      const view = await createSavedView({
        name: request.body.name,
        shared: request.body.shared,
        state: request.body.state,
        currentUserId: current?.id ?? null,
      });
      return { view };
    },
  );

  app.delete(
    '/api/saved-views/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ ok: z.literal(true) }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const current = await resolveActingUser(request);
      const ok = await deleteSavedView(request.params.id, current?.id ?? null);
      if (!ok) return reply.code(404).send({ message: 'Saved view not found' });
      return { ok: true as const };
    },
  );
}
