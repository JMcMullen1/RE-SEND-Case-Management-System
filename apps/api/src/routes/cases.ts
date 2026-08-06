import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  decodeViewState,
  OwnerQueueSchema,
  type OwnerQueue,
} from '@re-send/shared';
import {
  facetCounts,
  getCaseExpansion,
  listCases,
  reassignMany,
  reassignOwner,
  type OwnerTarget,
} from '../repositories/cases';
import { resolveCurrentUser } from '../repositories/users';
import { broadcast } from '../realtime';
import {
  CaseListQuerystringSchema,
  CaseListResponseSchema,
  CaseListRowSchema,
  OwnerTargetSchema,
} from './schemas';

function headerUserId(headers: Record<string, unknown>): string | undefined {
  const raw = headers['x-user-id'];
  return typeof raw === 'string' ? raw : undefined;
}

function targetFrom(body: {
  ownerUserId?: string;
  ownerQueue?: OwnerQueue;
}): OwnerTarget {
  return body.ownerUserId
    ? { ownerUserId: body.ownerUserId }
    : { ownerQueue: body.ownerQueue as OwnerQueue };
}

export function registerCaseRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/cases',
    {
      schema: {
        querystring: CaseListQuerystringSchema,
        response: { 200: CaseListResponseSchema },
      },
    },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (typeof value === 'string') params.set(key, value);
      }
      const view = decodeViewState(params);
      const current = await resolveCurrentUser(headerUserId(request.headers));

      const caseQuery = {
        filters: view.filters,
        search: view.search,
        sort: view.sort,
        limit: Number(query.limit ?? 50),
        offset: Number(query.offset ?? 0),
        currentUserId: current?.id ?? null,
      };

      const [list, counts] = await Promise.all([
        listCases(caseQuery),
        facetCounts(caseQuery),
      ]);
      return { ...list, facetCounts: counts };
    },
  );

  app.get(
    '/api/cases/:id/expansion',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            notes: z.array(
              z.object({
                entryDate: z.string(),
                author: z.string().nullable(),
                body: z.string(),
              }),
            ),
            email: z.string().nullable(),
            phone: z.string().nullable(),
            mobile: z.string().nullable(),
          }),
        },
      },
    },
    async (request) => getCaseExpansion(request.params.id),
  );

  app.patch(
    '/api/cases/:id/owner',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: OwnerTargetSchema,
        response: {
          200: z.object({ row: CaseListRowSchema }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const current = await resolveCurrentUser(headerUserId(request.headers));
      const row = await reassignOwner(
        request.params.id,
        targetFrom(request.body),
        current?.id ?? null,
      );
      if (!row) return reply.code(404).send({ message: 'Case not found' });
      broadcast({ type: 'caseChanged', caseId: row.id });
      return { row };
    },
  );

  app.post(
    '/api/cases/reassign',
    {
      schema: {
        body: z
          .object({
            caseIds: z.array(z.string().uuid()).min(1),
            ownerUserId: z.string().uuid().optional(),
            ownerQueue: OwnerQueueSchema.optional(),
          })
          .refine(
            (v) => (v.ownerUserId ? 1 : 0) + (v.ownerQueue ? 1 : 0) === 1,
            'Provide exactly one of ownerUserId or ownerQueue.',
          ),
        response: { 200: z.object({ updated: z.number() }) },
      },
    },
    async (request) => {
      const current = await resolveCurrentUser(headerUserId(request.headers));
      const updated = await reassignMany(
        request.body.caseIds,
        targetFrom(request.body),
        current?.id ?? null,
      );
      for (const id of request.body.caseIds) {
        broadcast({ type: 'caseChanged', caseId: id });
      }
      return { updated };
    },
  );
}
