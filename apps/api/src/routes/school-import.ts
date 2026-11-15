import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  SCHOOL_IMPORT_MAX,
  SCHOOL_AGE_MAX,
  SchoolFundingSchema,
  SchoolProvisionSchema,
} from '@re-send/shared';
import { resolveActingUser } from '../auth/context';
import {
  commitSchoolImport,
  previewSchoolImport,
} from '../repositories/school-import';

const Message = z.object({ message: z.string() });
const Text = (max: number) => z.string().trim().min(1).max(max).nullable();
const Age = z.number().int().min(0).max(SCHOOL_AGE_MAX).nullable();

const ImportedSchoolSchema = z
  .object({
    urn: z.string().regex(/^\d{5,7}$/),
    name: z.string().trim().min(1).max(200),
    address: Text(500),
    postcode: Text(10),
    localAuthority: Text(100),
    phone: Text(40),
    website: Text(300),
    funding: SchoolFundingSchema.nullable(),
    provision: SchoolProvisionSchema.nullable(),
    section41: z.boolean(),
    ageFrom: Age,
    ageTo: Age,
  })
  .strict();

const RequestSchema = z.object({
  schools: z
    .array(ImportedSchoolSchema)
    .min(1)
    .max(SCHOOL_IMPORT_MAX, {
      message: `At most ${SCHOOL_IMPORT_MAX} schools at once; choose fewer areas.`,
    }),
});

const Change = z.object({ from: z.unknown(), to: z.unknown() });
const UpdateSchema = z.object({
  id: z.string().uuid(),
  urn: z.string(),
  name: z.string(),
  matchedBy: z.enum(['urn', 'name']),
  archived: z.boolean(),
  changes: z.record(z.string(), Change),
});

const PreviewSchema = z.object({
  toCreate: z.number().int(),
  toUpdate: z.number().int(),
  unchanged: z.number().int(),
  repeated: z.number().int(),
  matchedByName: z.array(UpdateSchema),
  updates: z.array(UpdateSchema),
});

const ResultSchema = z.object({
  batchId: z.string().uuid(),
  created: z.number().int(),
  updated: z.number().int(),
  unchanged: z.number().int(),
});

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const current = await resolveActingUser(request);
  if (current?.role !== 'admin') {
    await reply.code(403).send({ message: 'Admins only.' });
    return null;
  }
  return current;
}

/** All of England is about 8 MB of schools; allow for it here only. */
const BODY_LIMIT = 40 * 1024 * 1024;

/**
 * Importing schools from the DfE's register (admins only). The browser reads
 * the DfE file and sends the schools in the areas chosen; preview changes
 * nothing; import plans again and applies it.
 */
export function registerSchoolImportRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/admin/import/schools/preview',
    {
      bodyLimit: BODY_LIMIT,
      schema: {
        body: RequestSchema,
        response: { 200: PreviewSchema, 403: Message },
      },
    },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;
      return previewSchoolImport(request.body.schools);
    },
  );

  app.post(
    '/api/admin/import/schools',
    {
      bodyLimit: BODY_LIMIT,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: RequestSchema,
        response: { 200: ResultSchema, 403: Message },
      },
    },
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;
      return commitSchoolImport(request.body.schools, admin.id);
    },
  );
}
