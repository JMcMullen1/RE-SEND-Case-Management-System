import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CaseSchoolRoleSchema,
  canEditSchools,
  schoolFieldsProblem,
  type SchoolFields,
} from '@re-send/shared';
import { resolveActingUser } from '../auth/context';
import {
  addContact,
  createSchool,
  getSchool,
  linkSchool,
  listCaseSchools,
  removeContact,
  searchSchools,
  setSchoolArchived,
  SchoolConflict,
  SchoolNotFound,
  unlinkSchool,
  updateCaseSchool,
  updateContact,
  updateSchool,
} from '../repositories/schools';
import {
  CaseSchoolSchema,
  ContactInputSchema,
  SchoolContactSchema,
  SchoolDetailSchema,
  SchoolFieldsInputSchema,
  SchoolPatchSchema,
  SchoolSearchQuerySchema,
  SchoolSummarySchema,
} from './schemas';

const Message = z.object({ message: z.string() });
const Errors = { 400: Message, 403: Message, 404: Message, 409: Message };
const IdParam = z.object({ id: z.string().uuid() });

/** The acting user if they may edit the directory, else a 403 is sent. */
async function editor(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{ id: string; role: string } | null> {
  const current = await resolveActingUser(request);
  if (!current || !canEditSchools(current.role)) {
    await reply
      .code(403)
      .send({ message: 'Your role cannot change the schools directory.' });
    return null;
  }
  return current;
}

function fail(reply: FastifyReply, err: unknown) {
  if (err instanceof SchoolNotFound)
    return reply.code(404).send({ message: err.message });
  if (err instanceof SchoolConflict)
    return reply.code(409).send({ message: err.message });
  throw err;
}

function withDefaults(
  input: z.infer<typeof SchoolFieldsInputSchema>,
): SchoolFields {
  return {
    name: input.name,
    urn: input.urn ?? null,
    address: input.address ?? null,
    postcode: input.postcode ?? null,
    localAuthority: input.localAuthority ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    website: input.website ?? null,
    funding: input.funding ?? null,
    provision: input.provision ?? null,
    section41: input.section41 ?? false,
    ageFrom: input.ageFrom ?? null,
    ageTo: input.ageTo ?? null,
    notes: input.notes ?? null,
  };
}

export function registerSchoolRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/schools',
    {
      schema: {
        querystring: SchoolSearchQuerySchema,
        response: { 200: z.object({ schools: z.array(SchoolSummarySchema) }) },
      },
    },
    async (request) => ({
      schools: await searchSchools({
        q: request.query.q,
        section41: request.query.section41 || undefined,
        funding: request.query.funding,
        provision: request.query.provision,
        includeArchived: request.query.archived,
      }),
    }),
  );

  app.get(
    '/api/schools/:id',
    {
      schema: {
        params: IdParam,
        response: { 200: SchoolDetailSchema, 404: Message },
      },
    },
    async (request, reply) => {
      const school = await getSchool(request.params.id);
      if (!school) return reply.code(404).send({ message: 'School not found' });
      return school;
    },
  );

  // Add a school. A likely duplicate comes back as 409 with the matches, so
  // the person can choose the existing school; `force` adds it anyway (never
  // over a URN already in use).
  app.post(
    '/api/schools',
    {
      schema: {
        querystring: z.object({
          force: z
            .enum(['true', 'false'])
            .optional()
            .transform((v) => v === 'true'),
        }),
        body: SchoolFieldsInputSchema,
        response: {
          200: SchoolDetailSchema,
          ...Errors,
          409: z.object({
            message: z.string(),
            duplicates: z.array(SchoolSummarySchema),
          }),
        },
      },
    },
    async (request, reply) => {
      const user = await editor(request, reply);
      if (!user) return;
      const fields = withDefaults(request.body);
      const problem = schoolFieldsProblem(fields);
      if (problem) return reply.code(400).send({ message: problem });
      let result: Awaited<ReturnType<typeof createSchool>>;
      try {
        result = await createSchool(fields, user.id, request.query.force);
      } catch (err) {
        if (err instanceof SchoolConflict)
          return reply.code(409).send({ message: err.message, duplicates: [] });
        throw err;
      }
      if ('duplicates' in result)
        return reply.code(409).send({
          message: 'This school may already be in the directory.',
          duplicates: result.duplicates,
        });
      return result.school;
    },
  );

  app.patch(
    '/api/schools/:id',
    {
      schema: {
        params: IdParam,
        body: SchoolPatchSchema,
        response: { 200: SchoolDetailSchema, ...Errors },
      },
    },
    async (request, reply) => {
      const user = await editor(request, reply);
      if (!user) return;
      const patch = request.body as Partial<SchoolFields>;
      const current = await getSchool(request.params.id);
      if (!current)
        return reply.code(404).send({ message: 'School not found' });
      const problem = schoolFieldsProblem({ ...current, ...patch });
      if (problem) return reply.code(400).send({ message: problem });
      try {
        return await updateSchool(request.params.id, patch, user.id);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // Archive or restore. Admins only: archiving hides the school from search.
  app.post(
    '/api/schools/:id/archive',
    {
      schema: {
        params: IdParam,
        body: z.object({ archived: z.boolean() }),
        response: { 200: SchoolDetailSchema, ...Errors },
      },
    },
    async (request, reply) => {
      const current = await resolveActingUser(request);
      if (current?.role !== 'admin')
        return reply
          .code(403)
          .send({ message: 'Only an admin can archive a school.' });
      try {
        return await setSchoolArchived(
          request.params.id,
          request.body.archived,
          current.id,
        );
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // --- Contacts ---------------------------------------------------------------

  app.post(
    '/api/schools/:id/contacts',
    {
      schema: {
        params: IdParam,
        body: ContactInputSchema,
        response: { 200: SchoolContactSchema, ...Errors },
      },
    },
    async (request, reply) => {
      const user = await editor(request, reply);
      if (!user) return;
      try {
        return await addContact(
          request.params.id,
          {
            name: request.body.name,
            role: request.body.role ?? null,
            email: request.body.email ?? null,
            phone: request.body.phone ?? null,
            notes: request.body.notes ?? null,
          },
          user.id,
        );
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  app.patch(
    '/api/school-contacts/:id',
    {
      schema: {
        params: IdParam,
        body: ContactInputSchema.partial(),
        response: { 200: SchoolContactSchema, ...Errors },
      },
    },
    async (request, reply) => {
      const user = await editor(request, reply);
      if (!user) return;
      try {
        return await updateContact(request.params.id, request.body, user.id);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  app.delete(
    '/api/school-contacts/:id',
    {
      schema: {
        params: IdParam,
        response: { 200: z.object({ deleted: z.literal(true) }), ...Errors },
      },
    },
    async (request, reply) => {
      const user = await editor(request, reply);
      if (!user) return;
      try {
        await removeContact(request.params.id, user.id);
        return { deleted: true as const };
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // --- Case links -------------------------------------------------------------

  const CaseSchools = z.object({ schools: z.array(CaseSchoolSchema) });

  app.get(
    '/api/cases/:id/schools',
    { schema: { params: IdParam, response: { 200: CaseSchools } } },
    async (request) => ({ schools: await listCaseSchools(request.params.id) }),
  );

  app.post(
    '/api/cases/:id/schools',
    {
      schema: {
        params: IdParam,
        body: z.object({
          schoolId: z.string().uuid(),
          role: CaseSchoolRoleSchema,
        }),
        response: { 200: CaseSchools, ...Errors },
      },
    },
    async (request, reply) => {
      const user = await editor(request, reply);
      if (!user) return;
      try {
        return {
          schools: await linkSchool(
            request.params.id,
            request.body.schoolId,
            request.body.role,
            user.id,
          ),
        };
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  app.patch(
    '/api/cases/:id/schools/:linkId',
    {
      schema: {
        params: z.object({
          id: z.string().uuid(),
          linkId: z.string().uuid(),
        }),
        body: z.object({
          role: CaseSchoolRoleSchema.optional(),
          contactIds: z.array(z.string().uuid()).optional(),
        }),
        response: { 200: CaseSchools, ...Errors },
      },
    },
    async (request, reply) => {
      const user = await editor(request, reply);
      if (!user) return;
      try {
        return {
          schools: await updateCaseSchool(
            request.params.id,
            request.params.linkId,
            request.body,
            user.id,
          ),
        };
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  app.delete(
    '/api/cases/:id/schools/:linkId',
    {
      schema: {
        params: z.object({
          id: z.string().uuid(),
          linkId: z.string().uuid(),
        }),
        response: { 200: CaseSchools, ...Errors },
      },
    },
    async (request, reply) => {
      const user = await editor(request, reply);
      if (!user) return;
      try {
        return {
          schools: await unlinkSchool(
            request.params.id,
            request.params.linkId,
            user.id,
          ),
        };
      } catch (err) {
        return fail(reply, err);
      }
    },
  );
}
