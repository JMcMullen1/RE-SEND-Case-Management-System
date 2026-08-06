import Fastify, { type FastifyBaseLogger } from 'fastify';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PRODUCT_NAME } from '@re-send/shared';
import { buildLogger } from './logging/logger';
import { env } from './env';
import { getDb } from './db/client';
import { sql } from 'drizzle-orm';
import { registerAiRoutes } from './routes/ai';
import { registerAuthRoutes } from './routes/auth';
import { registerCaseRoutes } from './routes/cases';
import { registerCaseScreenRoutes } from './routes/case-screen';
import { registerCorpusRoutes } from './routes/corpus';
import { registerCreateCaseRoutes } from './routes/create-case';
import { registerDocumentRoutes } from './routes/documents';
import { registerIntakeRoutes } from './routes/intake';
import { registerDirectionsRoutes } from './routes/directions';
import { registerCalendarRoutes } from './routes/calendar';
import { registerDemoRoutes } from './routes/demo';
import { registerUserRoutes } from './routes/users';
import { registerSavedViewRoutes } from './routes/saved-views';
import {
  addConnection,
  handleClientMessage,
  removeConnection,
} from './realtime';

/**
 * Build the Fastify app. Every HTTP route validates its input and output with
 * Zod. Requests carry a request id and are logged as structured JSON through a
 * redaction layer (nothing resembling personal data reaches a log). Security
 * headers, a strict-script CSP, HSTS and per-route rate limiting are applied
 * before the routes. The `/api/ws` channel carries live query invalidations and
 * case presence.
 */
export async function buildServer() {
  const app = Fastify({
    // A pino instance with a redacting destination. Cast to the base logger type
    // so route registration keeps Fastify's default logger generic.
    logger: buildLogger(env.LOG_LEVEL) as unknown as FastifyBaseLogger,
    // Fastify generates a per-request id; it appears on every log line as reqId.
    disableRequestLogging: false,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cookie);

  // Security headers. script-src is 'self' with NO unsafe-inline — the XSS-
  // critical directive — so injected scripts cannot execute. style-src keeps
  // 'unsafe-inline' because the SPA sets dynamic layout values (grid tracks,
  // virtualiser offsets) via the style attribute; inline styles cannot run
  // JavaScript, so this carries no script-execution risk. HSTS is enabled for
  // HTTPS deployments.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: { maxAge: 15552000, includeSubDomains: true, preload: true },
    crossOriginEmbedderPolicy: false,
  });

  // Rate limiting is opt-in per route (auth, upload and AI endpoints) rather
  // than global, so ordinary reads and the WebSocket stay unthrottled.
  await app.register(rateLimit, {
    global: false,
    max: 60,
    timeWindow: '1 minute',
  });

  await app.register(websocket);
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

  // Liveness: the process is up. No dependencies checked.
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

  // Readiness: the database is reachable. This is what Render's health check
  // points at — a process that is up but cannot reach its database is not ready.
  app.route({
    method: 'GET',
    url: '/health/ready',
    schema: {
      response: {
        200: z.object({
          status: z.literal('ready'),
          database: z.literal('up'),
        }),
        503: z.object({ status: z.literal('unready'), database: z.string() }),
      },
    },
    handler: async (_request, reply) => {
      try {
        await getDb().execute(sql`SELECT 1`);
        return { status: 'ready' as const, database: 'up' as const };
      } catch {
        return reply
          .code(503)
          .send({ status: 'unready' as const, database: 'unreachable' });
      }
    },
  });

  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerCreateCaseRoutes(app);
  registerCaseRoutes(app);
  registerCaseScreenRoutes(app);
  registerDocumentRoutes(app);
  registerCorpusRoutes(app);
  registerAiRoutes(app);
  registerIntakeRoutes(app);
  registerDirectionsRoutes(app);
  registerCalendarRoutes(app);
  registerSavedViewRoutes(app);
  registerDemoRoutes(app);

  app.get('/api/ws', { websocket: true }, (socket) => {
    const id = addConnection((data) => socket.send(data));
    socket.on('message', (raw: Buffer) =>
      handleClientMessage(id, raw.toString()),
    );
    socket.on('close', () => removeConnection(id));
    socket.on('error', () => removeConnection(id));
  });

  return app;
}
