import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env } from '../env';
import {
  getSpendByJob,
  listJobFlags,
  setJobFlag,
} from '../repositories/ai-jobs';
import { recordAudit } from '../repositories/audit';
import { getDb } from '../db/client';
import { resolveActingUser } from '../auth/context';
import { AiJobFlagSchema, AiSpendByJobSchema } from './schemas';

/**
 * Admin surface for the AI job layer: the global switch, per-job flags (toggled
 * at runtime without a deploy), and the cost-accounting rollup.
 */
export function registerAiRoutes(fastify: FastifyInstance): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/ai/flags',
    {
      schema: {
        response: {
          200: z.object({
            globalEnabled: z.boolean(),
            flags: z.array(AiJobFlagSchema),
          }),
        },
      },
    },
    async () => ({
      globalEnabled: env.AI_ENABLED,
      flags: await listJobFlags(),
    }),
  );

  app.post(
    '/api/ai/flags',
    {
      schema: {
        body: AiJobFlagSchema,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request) => {
      const flagId = await setJobFlag(
        request.body.jobName,
        request.body.enabled,
      );
      const current = await resolveActingUser(request);
      await recordAudit(getDb(), {
        actorUserId: current?.id ?? null,
        action: 'ai.flag.set',
        entityType: 'ai_job_flag',
        entityId: flagId,
        after: { jobName: request.body.jobName, enabled: request.body.enabled },
      });
      return { ok: true as const };
    },
  );

  app.get(
    '/api/ai/spend',
    {
      schema: {
        response: { 200: z.object({ spend: z.array(AiSpendByJobSchema) }) },
      },
    },
    async () => ({ spend: await getSpendByJob() }),
  );
}
