import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PRODUCT_NAME } from '@re-send/shared';

/**
 * Build the Fastify app. Every route validates its input and output with Zod
 * via the Zod type provider; there are no unvalidated request or response
 * bodies anywhere in the API.
 */
export function buildServer() {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.route({
    method: 'GET',
    url: '/health',
    schema: {
      response: {
        200: z.object({
          status: z.literal('ok'),
          service: z.string(),
        }),
      },
    },
    handler: async () => ({ status: 'ok' as const, service: PRODUCT_NAME }),
  });

  return app;
}
