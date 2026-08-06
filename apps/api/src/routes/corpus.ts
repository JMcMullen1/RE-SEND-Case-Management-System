import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CorpusItemTypeSchema } from '@re-send/shared';
import { caseCorpus } from '../corpus/case-corpus';
import { CorpusResultSchema } from './schemas';

const CsvList = z
  .string()
  .optional()
  .transform((v) =>
    v
      ? v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
  );

export function registerCorpusRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // The single reading surface for AI features. `include` selects item types
  // (csv); `documentIds` narrows to specific documents (csv).
  app.get(
    '/api/cases/:id/corpus',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({
          include: CsvList.pipe(z.array(CorpusItemTypeSchema).optional()),
          documentIds: CsvList,
        }),
        response: { 200: CorpusResultSchema },
      },
    },
    async (request) =>
      caseCorpus(request.params.id, {
        include: request.query.include,
        documentIds: request.query.documentIds,
      }),
  );
}
