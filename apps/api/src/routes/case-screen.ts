import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { londonToday, NoteKindSchema } from '@re-send/shared';
import { getCaseDetail, listTimeline } from '../repositories/case-detail';
import { listDocuments } from '../repositories/documents';
import {
  setCaseTeams,
  updateCaseFields,
  updateChildFields,
  updateClientFields,
} from '../repositories/case-edit';
import {
  createKeyDate,
  deleteKeyDate,
  listKeyDates,
  updateKeyDate,
} from '../repositories/key-dates';
import { addNote, editNote, NoteForbidden } from '../repositories/notes';
import { recordReview } from '../repositories/reviews';
import { resolveActingUser } from '../auth/context';
import {
  CaseDetailSchema,
  CaseFieldsPatchSchema,
  ChildFieldsPatchSchema,
  ClientFieldsPatchSchema,
  DocumentInfoSchema,
  KeyDateCreateSchema,
  KeyDateFullSchema,
  KeyDatePatchSchema,
  NoteCreateSchema,
  NoteEditSchema,
  SetTeamsSchema,
  TimelineItemSchema,
} from './schemas';

const IdParam = z.object({ id: z.string().uuid() });

export function registerCaseScreenRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/cases/:id/review',
    {
      schema: {
        params: IdParam,
        body: z.object({ note: z.string().optional() }),
        response: {
          200: z.object({ reviewedAt: z.string() }),
          400: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const current = await resolveActingUser(request);
      if (!current) return reply.code(400).send({ message: 'No acting user' });
      return recordReview(
        request.params.id,
        current.id,
        request.body.note?.trim() || null,
      );
    },
  );

  app.get(
    '/api/cases/:id/detail',
    {
      schema: {
        params: IdParam,
        response: {
          200: CaseDetailSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const detail = await getCaseDetail(request.params.id);
      if (!detail) return reply.code(404).send({ message: 'Case not found' });
      return detail;
    },
  );

  app.patch(
    '/api/cases/:id/fields',
    {
      schema: {
        params: IdParam,
        body: CaseFieldsPatchSchema,
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (request) => {
      const current = await resolveActingUser(request);
      const ok = await updateCaseFields(
        request.params.id,
        request.body,
        current?.id ?? null,
      );
      return { ok };
    },
  );

  app.patch(
    '/api/clients/:id',
    {
      schema: {
        params: IdParam,
        body: ClientFieldsPatchSchema,
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (request) => {
      const current = await resolveActingUser(request);
      const ok = await updateClientFields(
        request.params.id,
        request.body,
        current?.id ?? null,
      );
      return { ok };
    },
  );

  app.patch(
    '/api/children/:id',
    {
      schema: {
        params: IdParam,
        body: ChildFieldsPatchSchema,
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (request) => {
      const current = await resolveActingUser(request);
      const ok = await updateChildFields(
        request.params.id,
        request.body,
        current?.id ?? null,
      );
      return { ok };
    },
  );

  app.put(
    '/api/cases/:id/teams',
    {
      schema: {
        params: IdParam,
        body: SetTeamsSchema,
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (request) => {
      const current = await resolveActingUser(request);
      const ok = await setCaseTeams(
        request.params.id,
        request.body.team,
        current?.id ?? null,
      );
      return { ok };
    },
  );

  // --- Key dates ------------------------------------------------------------

  app.get(
    '/api/cases/:id/key-dates',
    {
      schema: {
        params: IdParam,
        response: { 200: z.object({ keyDates: z.array(KeyDateFullSchema) }) },
      },
    },
    async (request) => ({ keyDates: await listKeyDates(request.params.id) }),
  );

  app.post(
    '/api/cases/:id/key-dates',
    {
      schema: {
        params: IdParam,
        body: KeyDateCreateSchema,
        response: { 200: z.object({ keyDate: KeyDateFullSchema }) },
      },
    },
    async (request) => {
      const current = await resolveActingUser(request);
      const keyDate = await createKeyDate(
        request.params.id,
        request.body,
        current?.id ?? null,
      );
      return { keyDate };
    },
  );

  app.patch(
    '/api/key-dates/:id',
    {
      schema: {
        params: IdParam,
        body: KeyDatePatchSchema,
        response: {
          200: z.object({ keyDate: KeyDateFullSchema }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const current = await resolveActingUser(request);
      const result = await updateKeyDate(
        request.params.id,
        request.body,
        current?.id ?? null,
      );
      if (!result)
        return reply.code(404).send({ message: 'Key date not found' });
      return { keyDate: result.keyDate };
    },
  );

  app.delete(
    '/api/key-dates/:id',
    {
      schema: {
        params: IdParam,
        response: {
          200: z.object({ ok: z.literal(true) }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const current = await resolveActingUser(request);
      const result = await deleteKeyDate(
        request.params.id,
        current?.id ?? null,
      );
      if (!result)
        return reply.code(404).send({ message: 'Key date not found' });
      return { ok: true as const };
    },
  );

  // --- Documents (metadata) & timeline --------------------------------------

  app.get(
    '/api/cases/:id/documents',
    {
      schema: {
        params: IdParam,
        response: { 200: z.object({ documents: z.array(DocumentInfoSchema) }) },
      },
    },
    async (request) => ({ documents: await listDocuments(request.params.id) }),
  );

  app.get(
    '/api/cases/:id/timeline',
    {
      schema: {
        params: IdParam,
        querystring: z.object({
          author: z.string().uuid().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
          q: z.string().optional(),
          kind: NoteKindSchema.optional(),
        }),
        response: { 200: z.object({ items: z.array(TimelineItemSchema) }) },
      },
    },
    async (request) => {
      const current = await resolveActingUser(request);
      const items = await listTimeline(
        request.params.id,
        {
          authorId: request.query.author,
          from: request.query.from,
          to: request.query.to,
          q: request.query.q,
          kind: request.query.kind,
        },
        current ? { id: current.id, role: current.role } : null,
      );
      return { items };
    },
  );

  app.post(
    '/api/cases/:id/notes',
    {
      schema: {
        params: IdParam,
        body: NoteCreateSchema,
        response: { 200: z.object({ item: TimelineItemSchema }) },
      },
    },
    async (request, reply) => {
      const current = await resolveActingUser(request);
      if (!current)
        return reply.code(400).send({ message: 'No acting user' } as never);
      const item = await addNote(
        request.params.id,
        request.body.body,
        request.body.kind,
        londonToday(new Date()),
        {
          id: current.id,
          displayName: current.displayName,
          role: current.role,
        },
      );
      return { item };
    },
  );

  app.patch(
    '/api/notes/:id',
    {
      schema: {
        params: IdParam,
        body: NoteEditSchema,
        response: {
          200: z.object({ item: TimelineItemSchema }),
          403: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const current = await resolveActingUser(request);
      if (!current) return reply.code(403).send({ message: 'No acting user' });
      try {
        const result = await editNote(request.params.id, request.body.body, {
          id: current.id,
          displayName: current.displayName,
          role: current.role,
        });
        if (!result) return reply.code(404).send({ message: 'Note not found' });
        return { item: result.item };
      } catch (error) {
        if (error instanceof NoteForbidden) {
          return reply.code(403).send({ message: error.message });
        }
        throw error;
      }
    },
  );
}
