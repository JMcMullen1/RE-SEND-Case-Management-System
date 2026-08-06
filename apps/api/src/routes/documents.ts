import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { DocumentCategorySchema, isPreviewable } from '@re-send/shared';
import { createDocument, getDocumentContent } from '../repositories/documents';
import { resolveCurrentUser } from '../repositories/users';
import { DocumentInfoSchema } from './schemas';

function actorId(headers: Record<string, unknown>): string | undefined {
  const raw = headers['x-user-id'];
  return typeof raw === 'string' ? raw : undefined;
}

export function registerDocumentRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Multipart upload: the file is streamed; the category rides in the query.
  app.post(
    '/api/cases/:id/documents',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({ category: DocumentCategorySchema }),
        response: {
          200: z.object({ document: DocumentInfoSchema }),
          400: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const file = await request.file();
      if (!file) return reply.code(400).send({ message: 'No file uploaded' });
      const bytes = await file.toBuffer();
      const current = await resolveCurrentUser(actorId(request.headers));
      const document = await createDocument(
        request.params.id,
        {
          filename: file.filename,
          mimeType: file.mimetype,
          bytes,
          category: request.query.category,
        },
        current?.id ?? null,
      );
      return { document };
    },
  );

  // Binary content — inline for preview, attachment for download.
  app.get(
    '/api/documents/:id/content',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({ download: z.string().optional() }),
      },
    },
    async (request, reply) => {
      const content = await getDocumentContent(request.params.id);
      if (!content)
        return reply.code(404).send({ message: 'Document not found' });
      const inline = !request.query.download && isPreviewable(content.mimeType);
      reply
        .header(
          'content-disposition',
          `${inline ? 'inline' : 'attachment'}; filename="${content.filename.replace(/"/g, '')}"`,
        )
        .type(content.mimeType);
      return reply.send(content.bytes);
    },
  );
}
