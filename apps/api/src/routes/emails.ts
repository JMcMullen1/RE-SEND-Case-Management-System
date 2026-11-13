import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { resolveActingUser } from '../auth/context';
import { EmailParseError } from '../email/parse';
import {
  CaseNotFoundError,
  deleteEmail,
  fileEmail,
  listEmails,
} from '../repositories/emails';
import { EmailFileResultSchema, EmailInfoSchema } from './schemas';

const Message = z.object({ message: z.string() });

export function registerEmailRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // File one email (.eml or .msg) against a case. Multipart, like documents;
  // attachments are filed as case documents on the way in.
  app.post(
    '/api/cases/:id/emails',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: EmailFileResultSchema,
          400: Message,
          404: Message,
          422: Message,
        },
      },
    },
    async (request, reply) => {
      const file = await request.file();
      if (!file) return reply.code(400).send({ message: 'No file uploaded' });
      const bytes = await file.toBuffer();
      const current = await resolveActingUser(request);
      try {
        return await fileEmail(
          request.params.id,
          { filename: file.filename, mimeType: file.mimetype, bytes },
          current?.id ?? null,
        );
      } catch (err) {
        if (err instanceof CaseNotFoundError)
          return reply.code(404).send({ message: 'Case not found' });
        if (err instanceof EmailParseError)
          return reply.code(422).send({ message: err.message });
        throw err;
      }
    },
  );

  app.get(
    '/api/cases/:id/emails',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ emails: z.array(EmailInfoSchema) }) },
      },
    },
    async (request) => ({ emails: await listEmails(request.params.id) }),
  );

  // Remove an email filed in error (soft, audited). Its attachments stay on the
  // case as documents.
  app.delete(
    '/api/cases/:id/emails/:emailId',
    {
      schema: {
        params: z.object({
          id: z.string().uuid(),
          emailId: z.string().uuid(),
        }),
        response: { 200: z.object({ deleted: z.boolean() }), 404: Message },
      },
    },
    async (request, reply) => {
      const current = await resolveActingUser(request);
      const deleted = await deleteEmail(
        request.params.id,
        request.params.emailId,
        current?.id ?? null,
      );
      if (!deleted) return reply.code(404).send({ message: 'Email not found' });
      return { deleted };
    },
  );
}
