import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  decodeViewState,
  NoteKindSchema,
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
import {
  getCaseDeletionTarget,
  softDeleteCase,
} from '../repositories/case-edit';
import { resolveActingUser } from '../auth/context';
import {
  CaseListQuerystringSchema,
  CaseListResponseSchema,
  CaseListRowSchema,
  OwnerTargetSchema,
} from './schemas';

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
      const current = await resolveActingUser(request);

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
                kind: NoteKindSchema,
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
      const current = await resolveActingUser(request);
      const row = await reassignOwner(
        request.params.id,
        targetFrom(request.body),
        current?.id ?? null,
      );
      if (!row) return reply.code(404).send({ message: 'Case not found' });
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
      const current = await resolveActingUser(request);
      const updated = await reassignMany(
        request.body.caseIds,
        targetFrom(request.body),
        current?.id ?? null,
      );
      return { updated };
    },
  );

  // Delete a case. Destructive, so it is admin-only and guarded twice: the
  // caller must be an administrator, and must type back the client's name
  // (echoed in the request) — a deliberate, hard-to-do-by-accident action. The
  // delete is soft and fully audited (see softDeleteCase).
  app.delete(
    '/api/cases/:id',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ confirmName: z.string().min(1) }),
        response: {
          200: z.object({ ok: z.literal(true) }),
          400: z.object({ message: z.string() }),
          403: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const current = await resolveActingUser(request);
      if (!current) return reply.code(403).send({ message: 'Not signed in.' });
      if (current.role !== 'admin')
        return reply
          .code(403)
          .send({ message: 'Only an administrator can delete a case.' });

      const target = await getCaseDeletionTarget(request.params.id);
      if (!target) return reply.code(404).send({ message: 'Case not found.' });

      // The confirmation string is the client's name, or the case reference
      // when the case has no client. Compared case-insensitively, trimmed.
      const expected = (target.clientName ?? target.caseReference).trim();
      if (
        request.body.confirmName.trim().toLowerCase() !== expected.toLowerCase()
      )
        return reply
          .code(400)
          .send({ message: 'The name entered does not match this case.' });

      const ok = await softDeleteCase(request.params.id, current.id);
      if (!ok) return reply.code(404).send({ message: 'Case not found.' });
      return { ok: true as const };
    },
  );
}
