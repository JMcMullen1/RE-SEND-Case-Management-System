import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CASE_IMPORT_FIELD_IDS,
  CASE_IMPORT_MAX_ROWS,
  type CaseImportAnalysis,
} from '@re-send/shared';
import { resolveActingUser } from '../auth/context';
import {
  commitCaseImport,
  ImportChanged,
  previewCaseImport,
} from '../repositories/case-import';

const Message = z.object({ message: z.string() });
const FieldId = z.enum(CASE_IMPORT_FIELD_IDS);
// Excel holds up to 32,767 characters in a cell.
const Cell = z.string().max(40_000);

const ImportRequestSchema = z.object({
  rows: z.array(z.array(Cell).max(200)).max(CASE_IMPORT_MAX_ROWS, {
    message: `A case list can have at most ${CASE_IMPORT_MAX_ROWS} rows; split it into several files.`,
  }),
  firstRowNumber: z.number().int().min(1),
  mapping: z.array(FieldId.nullable()).max(200),
  valueMaps: z
    .record(FieldId, z.record(z.string().max(500), z.string().max(200)))
    .default({}),
});

const Values = z.record(FieldId, z.string());
const AnalysisSchema = z.object({
  rows: z.array(
    z.object({
      rowNumber: z.number().int(),
      outcome: z.enum(['import', 'duplicate', 'problem']),
      raw: Values,
      shown: Values,
      issues: z.array(
        z.object({
          level: z.enum(['problem', 'warning']),
          message: z.string(),
        }),
      ),
      clientNote: z.string().nullable(),
    }),
  ),
  valuesToMatch: z.array(
    z.object({
      field: FieldId,
      value: z.string(),
      count: z.number().int(),
      matchedTo: z.string().nullable(),
    }),
  ),
  fingerprint: z.string(),
  summary: z.object({
    total: z.number().int(),
    toImport: z.number().int(),
    duplicates: z.number().int(),
    problems: z.number().int(),
    existingClients: z.number().int(),
    withWarnings: z.number().int(),
  }),
});

const ResultSchema = z.object({
  batchId: z.string(),
  casesCreated: z.number().int(),
  clientsCreated: z.number().int(),
  childrenCreated: z.number().int(),
  duplicatesSkipped: z.number().int(),
  problemsSkipped: z.number().int(),
});

/** The preview as sent to the browser: the import plan stays on the server. */
function withoutPlans(analysis: CaseImportAnalysis & { fingerprint: string }) {
  return {
    ...analysis,
    rows: analysis.rows.map(({ plan: _plan, ...row }) => row),
  };
}

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const current = await resolveActingUser(request);
  if (current?.role !== 'admin') {
    await reply.code(403).send({ message: 'Admins only.' });
    return null;
  }
  return current;
}

/** A case list is large; allow for it on these two routes only. */
const BODY_LIMIT = 40 * 1024 * 1024;

/**
 * Importing the charity's existing case list (admins only). The browser reads
 * the spreadsheet — the file itself is never uploaded or kept — and sends its
 * rows. Preview changes nothing; import re-checks and creates the cases.
 */
export function registerCaseImportRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/admin/import/cases/preview',
    {
      bodyLimit: BODY_LIMIT,
      schema: {
        body: ImportRequestSchema,
        response: { 200: AnalysisSchema, 403: Message },
      },
    },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;
      return withoutPlans(await previewCaseImport(request.body));
    },
  );

  app.post(
    '/api/admin/import/cases',
    {
      bodyLimit: BODY_LIMIT,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: ImportRequestSchema.extend({
          /** The fingerprint of the list as previewed. */
          expectedFingerprint: z.string().length(64),
          /** How many cases the preview said would be imported. */
          expectedToImport: z.number().int().min(1),
        }),
        response: { 200: ResultSchema, 403: Message, 409: Message },
      },
    },
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;
      const { expectedFingerprint, expectedToImport, ...list } = request.body;
      try {
        return await commitCaseImport(
          list,
          { fingerprint: expectedFingerprint, toImport: expectedToImport },
          admin.id,
        );
      } catch (err) {
        if (err instanceof ImportChanged)
          return reply.code(409).send({ message: err.message });
        throw err;
      }
    },
  );
}
