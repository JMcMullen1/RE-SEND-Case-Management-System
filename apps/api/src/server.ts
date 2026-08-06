import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PRODUCT_NAME } from '@re-send/shared';
import { registerCaseRoutes } from './routes/cases';
import { registerCaseScreenRoutes } from './routes/case-screen';
import { registerCreateCaseRoutes } from './routes/create-case';
import { registerDocumentRoutes } from './routes/documents';
import { registerUserRoutes } from './routes/users';
import { registerSavedViewRoutes } from './routes/saved-views';
import { addClient } from './realtime';

/**
 * Build the Fastify app. Every HTTP route validates its input and output with
 * Zod via the Zod type provider. The `/api/ws` channel carries live case and
 * key-date change notifications; its outbound messages are validated in
 * `realtime.ts`.
 */
export async function buildServer() {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(websocket);
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

  app.route({
    method: 'GET',
    url: '/health',
    schema: {
      response: {
        200: z.object({ status: z.literal('ok'), service: z.string() }),
      },
    },
    handler: async () => ({ status: 'ok' as const, service: PRODUCT_NAME }),
  });

  registerUserRoutes(app);
  registerCreateCaseRoutes(app);
  registerCaseRoutes(app);
  registerCaseScreenRoutes(app);
  registerDocumentRoutes(app);
  registerSavedViewRoutes(app);

  app.get('/api/ws', { websocket: true }, (socket) => {
    const off = addClient({ send: (data) => socket.send(data) });
    socket.on('close', off);
    socket.on('error', off);
  });

  return app;
}
