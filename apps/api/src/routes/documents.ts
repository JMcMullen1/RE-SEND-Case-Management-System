import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { DocumentCategorySchema, isPreviewable } from '@re-send/shared';
import {
  createDocument,
  getDocumentContent,
  listDocumentVersions,
} from '../repositories/documents';
import { resolveActingUser } from '../auth/context';
import {
  DocumentUploadResultSchema,
  DocumentVersionInfoSchema,
} from './schemas';

export function registerDocumentRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Multipart upload: the file is streamed; the category rides in the query.
  //
  // PRESIGNED-UPLOAD SWAP POINT (server): to move to direct-to-storage uploads,
  // add a sibling route that returns a presigned PUT URL from the storage
  // provider (StorageProvider.getSignedUrl with method PUT) plus the document
  // id, and have the client PUT the bytes straight to storage, then confirm.
  // Everything else — dedup, versioning, extraction, audit — stays server-side.
  app.post(
    '/api/cases/:id/documents',
    {
      // Upload endpoint: rate-limited to bound storage churn and extraction.
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({ category: DocumentCategorySchema }),
        response: {
          200: DocumentUploadResultSchema,
          400: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const file = await request.file();
      if (!file) return reply.code(400).send({ message: 'No file uploaded' });
      const bytes = await file.toBuffer();
      const current = await resolveActingUser(request);
      const result = await createDocument(
        request.params.id,
        {
          filename: file.filename,
          mimeType: file.mimetype,
          bytes,
          category: request.query.category,
        },
        current?.id ?? null,
      );
      return result;
    },
  );

  // Version history for a document group.
  app.get(
    '/api/documents/:id/versions',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ versions: z.array(DocumentVersionInfoSchema) }),
        },
      },
    },
    async (request) => ({
      versions: await listDocumentVersions(request.params.id),
    }),
  );

  // Binary content — inline for preview, attachment for download. Every read is
  // routed through here and audited; storage URLs never reach the browser.
  app.get(
    '/api/documents/:id/content',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({ download: z.string().optional() }),
      },
    },
    async (request, reply) => {
      const current = await resolveActingUser(request);
      const content = await getDocumentContent(
        request.params.id,
        current?.id ?? null,
      );
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
