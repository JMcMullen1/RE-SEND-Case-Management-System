import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  summariseDiff,
  type DirectionsApplyResult,
  type DirectionsResponse,
} from '@re-send/shared';
import { AiJobDisabledError, AiJobRefusalError } from '../ai/errors';
import { runDirectionsExtraction } from '../ai/directions';
import { applyDirections } from '../repositories/directions';
import { resolveActingUser } from '../auth/context';
import {
  ApplyDirectionsRequestSchema,
  DirectionsApplyResultSchema,
  DirectionsResponseSchema,
} from './schemas';

/**
 * Directions-order ingestion. The extract endpoint stores the order and returns
 * a diff for review; nothing touches the calendar until apply is called with the
 * reviewed rows. Extraction failures (switched off, refused, or an error) are
 * clean typed outcomes so the case screen degrades gracefully.
 */
export function registerDirectionsRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Upload a directions order (PDF or DOCX). Multipart; case in the path.
  app.post(
    '/api/cases/:id/directions/extract',
    {
      // AI + upload endpoint: rate-limited to bound model spend and file churn.
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: DirectionsResponseSchema },
      },
    },
    async (request, reply) => {
      const file = await request.file();
      if (!file)
        return reply.code(200).send({
          status: 'error',
          message: 'No file uploaded',
        } satisfies DirectionsResponse);
      const bytes = await file.toBuffer();
      const current = await resolveActingUser(request);
      try {
        const review = await runDirectionsExtraction(
          {
            caseId: request.params.id,
            bytes,
            filename: file.filename,
            mimeType: file.mimetype,
          },
          current?.id ?? null,
        );
        return { status: 'ok', review } satisfies DirectionsResponse;
      } catch (err) {
        if (err instanceof AiJobDisabledError)
          return { status: 'disabled' } satisfies DirectionsResponse;
        if (err instanceof AiJobRefusalError)
          return { status: 'refused' } satisfies DirectionsResponse;
        return {
          status: 'error',
          message: 'The order could not be read',
        } satisfies DirectionsResponse;
      }
    },
  );

  // Apply the reviewed diff: write the changes in one transaction under one
  // audit entry. This is the only endpoint that touches the calendar.
  app.post(
    '/api/cases/:id/directions/apply',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: ApplyDirectionsRequestSchema,
        response: { 200: DirectionsApplyResultSchema },
      },
    },
    async (request): Promise<DirectionsApplyResult> => {
      const current = await resolveActingUser(request);
      const { created, superseded, counts } = await applyDirections(
        {
          caseId: request.params.id,
          sourceDocumentId: request.body.documentId,
          rows: request.body.rows,
        },
        current?.id ?? null,
      );
      return {
        created: created.length,
        superseded: superseded.length,
        summary: summariseDiff(counts),
      };
    },
  );
}
