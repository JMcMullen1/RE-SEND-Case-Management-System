import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  OwnerQueueSchema,
  UserRoleSchema,
  isPlausibleEmail,
  londonToday,
} from '@re-send/shared';
import { resolveActingUser } from '../auth/context';
import { streamExport } from '../export/zip';
import { recordAudit } from '../repositories/audit';
import { getDb } from '../db/client';
import {
  createStaff,
  deactivateStaff,
  listStaff,
  reactivateStaff,
  StaffConflict,
  StaffNotFound,
  StaffRuleBroken,
  updateStaff,
} from '../repositories/staff';

const Message = z.object({ message: z.string() });
const IdParam = z.object({ id: z.string().uuid() });
const Errors = { 400: Message, 403: Message, 404: Message, 409: Message };

const StaffMemberSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string(),
  role: UserRoleSchema,
  active: z.boolean(),
  openCaseCount: z.number().int(),
});

const Email = z
  .string()
  .trim()
  .max(200)
  .refine(isPlausibleEmail, 'Enter a valid email address.');

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const current = await resolveActingUser(request);
  if (current?.role !== 'admin') {
    await reply.code(403).send({ message: 'Admins only.' });
    return null;
  }
  return current;
}

function fail(reply: FastifyReply, err: unknown) {
  if (err instanceof StaffNotFound)
    return reply.code(404).send({ message: err.message });
  if (err instanceof StaffConflict || err instanceof StaffRuleBroken)
    return reply.code(409).send({ message: err.message });
  throw err;
}

export function registerAdminRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // --- Staff (joiners, changes, leavers) --------------------------------------

  app.get(
    '/api/admin/staff',
    {
      schema: {
        response: {
          200: z.object({ staff: z.array(StaffMemberSchema) }),
          403: Message,
        },
      },
    },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;
      return { staff: await listStaff() };
    },
  );

  app.post(
    '/api/admin/staff',
    {
      schema: {
        body: z.object({
          displayName: z.string().trim().min(1).max(120),
          email: Email,
          role: UserRoleSchema,
        }),
        response: { 200: StaffMemberSchema, ...Errors },
      },
    },
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;
      try {
        return await createStaff(request.body, admin.id);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  app.patch(
    '/api/admin/staff/:id',
    {
      schema: {
        params: IdParam,
        body: z.object({
          displayName: z.string().trim().min(1).max(120).optional(),
          email: Email.optional(),
          role: UserRoleSchema.optional(),
        }),
        response: { 200: StaffMemberSchema, ...Errors },
      },
    },
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;
      try {
        return await updateStaff(request.params.id, request.body, admin.id);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // A leaver: signed out at once, open cases handed over if asked.
  app.post(
    '/api/admin/staff/:id/deactivate',
    {
      schema: {
        params: IdParam,
        body: z.object({
          handover: z.discriminatedUnion('kind', [
            z.object({ kind: z.literal('queue'), queue: OwnerQueueSchema }),
            z.object({ kind: z.literal('user'), userId: z.string().uuid() }),
            z.object({ kind: z.literal('none') }),
          ]),
        }),
        response: {
          200: z.object({
            member: StaffMemberSchema,
            casesHandedOver: z.number().int(),
          }),
          ...Errors,
        },
      },
    },
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;
      try {
        return await deactivateStaff(
          request.params.id,
          request.body.handover,
          admin.id,
        );
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  app.post(
    '/api/admin/staff/:id/reactivate',
    {
      schema: {
        params: IdParam,
        response: { 200: StaffMemberSchema, ...Errors },
      },
    },
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;
      try {
        return await reactivateStaff(request.params.id, admin.id);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // --- Full data export ------------------------------------------------------

  // Everything the charity holds — every table as CSV and every stored file —
  // as one ZIP, streamed. Admins only, rate-limited, and audited (who and
  // when; the contents are never logged). The reply is a binary download, so
  // it has no JSON response schema (like the document content route).
  app.get(
    '/api/admin/export',
    {
      config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;
      await recordAudit(getDb(), {
        actorUserId: admin.id,
        action: 'export.download',
        entityType: 'system',
        entityId: admin.id,
      });
      const { stream, done } = streamExport(admin.displayName);
      done
        .then((summary) =>
          request.log.info({ summary }, 'full data export written'),
        )
        .catch((err: unknown) =>
          request.log.error(
            { error: err instanceof Error ? err.name : 'unknown' },
            'full data export failed',
          ),
        );
      reply
        .header(
          'content-disposition',
          `attachment; filename="resend-export-${londonToday(new Date())}.zip"`,
        )
        .header('cache-control', 'no-store')
        .type('application/zip');
      return reply.send(stream);
    },
  );
}
