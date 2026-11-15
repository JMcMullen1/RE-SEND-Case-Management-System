import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  DocumentCategorySchema,
  SEARCH_QUERY_MAX,
  SEARCH_SCOPE_VALUES,
} from '@re-send/shared';
import { resolveActingUser } from '../auth/context';
import { searchFiles } from '../repositories/search';

const SearchHitSchema = z.object({
  kind: z.enum(['document', 'email']),
  id: z.string(),
  caseId: z.string(),
  caseReference: z.string(),
  childName: z.string().nullable(),
  clientName: z.string().nullable(),
  title: z.string(),
  detail: z.string().nullable(),
  date: z.string().nullable(),
  current: z.boolean(),
  snippet: z.string(),
});

/**
 * Search inside documents and emails, across one case or the caseload. A
 * POST, so the words searched for travel in the body and never appear in a
 * URL that the request log records.
 */
export function registerSearchRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.post(
    '/api/search',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        body: z.object({
          q: z.string().trim().min(1).max(SEARCH_QUERY_MAX),
          caseId: z.string().uuid().nullable().optional(),
          scope: z.enum(SEARCH_SCOPE_VALUES).optional(),
          folder: DocumentCategorySchema.nullable().optional(),
          includeEarlierVersions: z.boolean().optional(),
        }),
        response: {
          200: z.object({
            hits: z.array(SearchHitSchema),
            total: z.number().int(),
          }),
        },
      },
    },
    async (request) => {
      const current = await resolveActingUser(request);
      return searchFiles(request.body, current?.id ?? null);
    },
  );
}
