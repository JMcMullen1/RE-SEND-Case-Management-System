import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { EMAIL_FILING_ROLES, EmailMatchReasonSchema } from '@re-send/shared';
import { resolveActingUser } from '../auth/context';
import { EmailParseError } from '../email/parse';
import { CaseNotFoundError } from '../repositories/emails';
import {
  dismissInboxItem,
  fileInboxItem,
  inboxCount,
  inboxEmailText,
  InboxItemNotFound,
  InboxItemResolved,
  intakeEmail,
  listInbox,
} from '../repositories/email-inbox';

const Message = z.object({ message: z.string() });

const SuggestionSchema = z.object({
  caseId: z.string().uuid(),
  caseReference: z.string(),
  clientName: z.string().nullable(),
  childName: z.string().nullable(),
  closed: z.boolean(),
  score: z.number().int(),
  reasons: z.array(EmailMatchReasonSchema),
});

const ItemSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  subject: z.string().nullable(),
  fromName: z.string().nullable(),
  fromAddress: z.string().nullable(),
  sentAt: z.string().nullable(),
  addedAt: z.string(),
  addedByName: z.string().nullable(),
  suggestions: z.array(SuggestionSchema),
});

const IntakeResultSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('filed'),
    emailId: z.string().uuid(),
    caseId: z.string().uuid(),
    caseReference: z.string(),
    reasons: z.array(EmailMatchReasonSchema),
  }),
  z.object({
    outcome: z.literal('duplicate'),
    emailId: z.string().uuid(),
    caseId: z.string().uuid(),
    caseReference: z.string(),
    reasons: z.array(EmailMatchReasonSchema),
  }),
  z.object({ outcome: z.literal('queued'), item: ItemSchema }),
  z.object({
    outcome: z.literal('already_waiting'),
    itemId: z.string().uuid(),
  }),
]);

const IdParams = z.object({ id: z.string().uuid() });

/** Who may file and dismiss (read-only users may look). */
async function filer(request: FastifyRequest, reply: FastifyReply) {
  const current = await resolveActingUser(request);
  if (
    !current ||
    !(EMAIL_FILING_ROLES as readonly string[]).includes(current.role)
  ) {
    await reply.code(403).send({ message: 'Your role cannot file emails.' });
    return null;
  }
  return current;
}

/**
 * Emails to file: drop in emails without choosing a case. Each is matched to
 * the cases from what they hold; a confident match is filed at once, anything
 * else waits in a shared list with suggested cases until someone chooses.
 */
export function registerEmailInboxRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/email-inbox',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        response: {
          200: IntakeResultSchema,
          400: Message,
          403: Message,
          422: Message,
        },
      },
    },
    async (request, reply) => {
      const user = await filer(request, reply);
      if (!user) return;
      const file = await request.file();
      if (!file) return reply.code(400).send({ message: 'No file uploaded' });
      const bytes = await file.toBuffer();
      try {
        return await intakeEmail(
          { filename: file.filename, mimeType: file.mimetype, bytes },
          user.id,
        );
      } catch (err) {
        if (err instanceof EmailParseError)
          return reply.code(422).send({ message: err.message });
        throw err;
      }
    },
  );

  app.get(
    '/api/email-inbox',
    {
      schema: {
        response: {
          200: z.object({
            items: z.array(ItemSchema),
            count: z.number().int(),
          }),
        },
      },
    },
    async () => {
      const items = await listInbox();
      return { items, count: items.length };
    },
  );

  app.get(
    '/api/email-inbox/count',
    { schema: { response: { 200: z.object({ count: z.number().int() }) } } },
    async () => ({ count: await inboxCount() }),
  );

  app.get(
    '/api/email-inbox/:id/text',
    {
      schema: {
        params: IdParams,
        response: {
          200: z.object({
            bodyText: z.string(),
            toAddresses: z.array(z.string()),
            ccAddresses: z.array(z.string()),
            attachmentNames: z.array(z.string()),
          }),
          404: Message,
          409: Message,
        },
      },
    },
    async (request, reply) => {
      try {
        return await inboxEmailText(request.params.id);
      } catch (err) {
        if (err instanceof InboxItemNotFound)
          return reply.code(404).send({ message: err.message });
        if (err instanceof InboxItemResolved)
          return reply.code(409).send({ message: err.message });
        throw err;
      }
    },
  );

  app.post(
    '/api/email-inbox/:id/file',
    {
      schema: {
        params: IdParams,
        body: z.object({ caseId: z.string().uuid() }),
        response: {
          200: IntakeResultSchema,
          403: Message,
          404: Message,
          409: Message,
          422: Message,
        },
      },
    },
    async (request, reply) => {
      const user = await filer(request, reply);
      if (!user) return;
      try {
        return await fileInboxItem(
          request.params.id,
          request.body.caseId,
          user.id,
        );
      } catch (err) {
        if (err instanceof InboxItemNotFound)
          return reply.code(404).send({ message: err.message });
        if (err instanceof CaseNotFoundError)
          return reply.code(404).send({ message: 'Case not found' });
        if (err instanceof InboxItemResolved)
          return reply.code(409).send({ message: err.message });
        if (err instanceof EmailParseError)
          return reply.code(422).send({ message: err.message });
        throw err;
      }
    },
  );

  app.post(
    '/api/email-inbox/:id/dismiss',
    {
      schema: {
        params: IdParams,
        response: {
          200: z.object({ dismissed: z.literal(true) }),
          403: Message,
          404: Message,
          409: Message,
        },
      },
    },
    async (request, reply) => {
      const user = await filer(request, reply);
      if (!user) return;
      try {
        await dismissInboxItem(request.params.id, user.id);
        return { dismissed: true as const };
      } catch (err) {
        if (err instanceof InboxItemNotFound)
          return reply.code(404).send({ message: err.message });
        if (err instanceof InboxItemResolved)
          return reply.code(409).send({ message: err.message });
        throw err;
      }
    },
  );
}
