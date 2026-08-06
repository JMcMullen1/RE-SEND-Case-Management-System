import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createCase,
  findMatches,
  getClientDetail,
  type CreateCaseInput,
} from '../repositories/create-case';
import { resolveCurrentUser } from '../repositories/users';
import { broadcast } from '../realtime';
import {
  CaseClientDetailSchema,
  CreateCaseSchema,
  MatchResultSchema,
} from './schemas';

function actorId(headers: Record<string, unknown>): string | undefined {
  const raw = headers['x-user-id'];
  return typeof raw === 'string' ? raw : undefined;
}

export function registerCreateCaseRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/cases',
    {
      schema: {
        body: CreateCaseSchema,
        response: {
          200: z.object({ caseId: z.string(), caseReference: z.string() }),
        },
      },
    },
    async (request) => {
      const current = await resolveCurrentUser(actorId(request.headers));
      const result = await createCase(
        request.body as CreateCaseInput,
        current?.id ?? null,
      );
      broadcast({ type: 'caseChanged', caseId: result.caseId });
      return result;
    },
  );

  app.get(
    '/api/matches',
    {
      schema: {
        querystring: z.object({
          childName: z.string().optional(),
          dob: z.string().optional(),
          email: z.string().optional(),
        }),
        response: { 200: MatchResultSchema },
      },
    },
    async (request) => findMatches(request.query),
  );

  app.get(
    '/api/clients/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: CaseClientDetailSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const client = await getClientDetail(request.params.id);
      if (!client) return reply.code(404).send({ message: 'Client not found' });
      return client;
    },
  );
}
