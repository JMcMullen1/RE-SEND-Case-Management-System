import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { IntakeResponse } from '@re-send/shared';
import { AiJobDisabledError, AiJobRefusalError } from '../ai/errors';
import { runIntakeExtraction, type IntakeInput } from '../ai/intake';
import { IntakeResponseSchema } from './schemas';

const SourceQuery = z.object({
  source: z.enum(['form', 'email']).default('form'),
});

/**
 * Smart fill for the add-case form. Extraction runs server-side and returns
 * mapped form values; it never writes to the database. Every failure — the
 * feature switched off, a refusal, or an error — is a clean, typed outcome so
 * the manual form stays fully usable.
 */
export function registerIntakeRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Uploaded submission (PDF/DOCX/HTML/.eml/text). Multipart; source in query.
  app.post(
    '/api/intake/extract',
    {
      // AI + upload endpoint: rate-limited so a burst can't run up model spend.
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        querystring: SourceQuery,
        response: { 200: IntakeResponseSchema },
      },
    },
    async (request, reply) => {
      const file = await request.file();
      if (!file)
        return reply.code(200).send({
          status: 'error',
          message: 'No file uploaded',
        } satisfies IntakeResponse);
      const bytes = await file.toBuffer();
      return extract({
        bytes,
        filename: file.filename,
        mimeType: file.mimetype,
        source: request.query.source,
      });
    },
  );

  // Pasted text (an enquiry email or a form copied into the box).
  app.post(
    '/api/intake/extract-text',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        body: z.object({
          text: z.string().min(1),
          source: z.enum(['form', 'email']).default('form'),
          filename: z.string().optional(),
        }),
        response: { 200: IntakeResponseSchema },
      },
    },
    async (request) =>
      extract({
        bytes: Buffer.from(request.body.text, 'utf8'),
        filename: request.body.filename ?? 'pasted-enquiry.txt',
        mimeType: 'text/plain',
        source: request.body.source,
      }),
  );
}

async function extract(input: IntakeInput): Promise<IntakeResponse> {
  try {
    const result = await runIntakeExtraction(input);
    return { status: 'ok', result };
  } catch (err) {
    if (err instanceof AiJobDisabledError) return { status: 'disabled' };
    if (err instanceof AiJobRefusalError) return { status: 'refused' };
    // Any other failure (transport, missing key, bad output) leaves the form
    // usable. No personal data in the message.
    return { status: 'error', message: 'Smart fill could not read this file' };
  }
}
