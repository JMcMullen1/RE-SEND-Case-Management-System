import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { canDraft } from '@re-send/shared';
import { resolveActingUser } from '../auth/context';
import {
  approveAndFile,
  DraftingUnavailable,
  requestPositionStatement,
} from '../drafting/generate';
import {
  deleteDraft,
  DraftConflict,
  DraftLocked,
  DraftNotFound,
  getDraft,
  listDrafts,
  saveDraftEdits,
} from '../repositories/drafts';
import { DraftEditSchema, DraftRequestSchema, DraftSchema } from './schemas';

const Message = z.object({ message: z.string() });
const IdParam = z.object({ id: z.string().uuid() });
const Errors = { 403: Message, 404: Message, 409: Message };

function fail(reply: FastifyReply, err: unknown) {
  if (err instanceof DraftNotFound)
    return reply.code(404).send({ message: err.message });
  if (
    err instanceof DraftLocked ||
    err instanceof DraftConflict ||
    err instanceof DraftingUnavailable
  )
    return reply.code(409).send({ message: err.message });
  throw err;
}

export function registerDraftRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /** The acting user if they may draft, else a 403 is sent. */
  const drafter = async (
    request: Parameters<typeof resolveActingUser>[0],
    reply: FastifyReply,
  ) => {
    const current = await resolveActingUser(request);
    if (!current || !canDraft(current.role)) {
      await reply
        .code(403)
        .send({ message: 'Your role does not use the drafting tools.' });
      return null;
    }
    return current;
  };

  app.get(
    '/api/cases/:id/drafts',
    {
      schema: {
        params: IdParam,
        response: { 200: z.object({ drafts: z.array(DraftSchema) }) },
      },
    },
    async (request) => ({ drafts: await listDrafts(request.params.id) }),
  );

  // Ask for a draft. It is written in the background; the case screen updates
  // live when it is ready. Rate-limited like every AI endpoint.
  app.post(
    '/api/cases/:id/drafts',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        params: IdParam,
        body: DraftRequestSchema,
        response: { 202: DraftSchema, ...Errors },
      },
    },
    async (request, reply) => {
      const user = await drafter(request, reply);
      if (!user) return;
      try {
        const id = await requestPositionStatement(
          request.params.id,
          request.body.instructions ?? null,
          user.id,
        );
        return reply.code(202).send((await getDraft(id))!);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  app.patch(
    '/api/drafts/:id',
    {
      schema: {
        params: IdParam,
        body: DraftEditSchema,
        response: { 200: DraftSchema, ...Errors },
      },
    },
    async (request, reply) => {
      const user = await drafter(request, reply);
      if (!user) return;
      try {
        return await saveDraftEdits(
          request.params.id,
          request.body.sections,
          request.body.baseUpdatedAt,
          user.id,
        );
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // Approve: lock the draft, record who and when, and file it as a document.
  app.post(
    '/api/drafts/:id/approve',
    {
      schema: {
        params: IdParam,
        response: { 200: DraftSchema, ...Errors },
      },
    },
    async (request, reply) => {
      const user = await drafter(request, reply);
      if (!user) return;
      try {
        return await approveAndFile(request.params.id, user.id);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  app.delete(
    '/api/drafts/:id',
    {
      schema: {
        params: IdParam,
        response: { 200: z.object({ deleted: z.literal(true) }), ...Errors },
      },
    },
    async (request, reply) => {
      const user = await drafter(request, reply);
      if (!user) return;
      try {
        await deleteDraft(request.params.id, user.id);
        return { deleted: true as const };
      } catch (err) {
        return fail(reply, err);
      }
    },
  );
}
