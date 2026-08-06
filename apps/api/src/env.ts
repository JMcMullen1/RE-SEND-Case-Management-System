import { z } from 'zod';

/**
 * Validated process environment. Fastify, Drizzle and everything else read
 * configuration from here, never from `process.env` directly.
 */
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url().optional(),

  // --- Object storage ------------------------------------------------------
  // Which StorageProvider backs document bytes. `local` writes under
  // UPLOAD_DIR; `s3` talks to any S3-compatible endpoint. Nothing outside the
  // storage module reads these — callers only see the StorageProvider interface.
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('.uploads'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  // Some providers (MinIO, older S3) need path-style addressing.
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // --- AI job layer --------------------------------------------------------
  // The Claude API key. Server-side only — it never reaches the browser. Every
  // AI call in the system goes through apps/api/src/ai.
  ANTHROPIC_API_KEY: z.string().optional(),
  // Global kill switch. `false` turns every AI feature off without a deploy;
  // per-job flags live in the ai_job_flags table for finer control.
  AI_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // Transient-failure retries (429/5xx/network). The SDK backs off exponentially.
  AI_MAX_RETRIES: z.coerce.number().int().min(0).default(2),

  // --- Sessions & secrets --------------------------------------------------
  // Signs the session cookie (HMAC). Required once auth is exercised; a random
  // fallback is generated in non-production so local dev needs no setup.
  SESSION_SECRET: z.string().optional(),
  // Reserved for encrypting data at rest (future). Named here so it is a first
  // class secret in .env.example and Render, not an afterthought.
  ENCRYPTION_KEY: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),

  // --- Demo mode -----------------------------------------------------------
  // Local password login for a small set of named accounts, so the system can
  // be demonstrated without a Microsoft tenant. NEVER valid in production — see
  // assertRuntimeSafety. Also gates the demo-reset command and route.
  DEMO_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Shared password for the demo accounts. Only consulted when DEMO_MODE is on.
  DEMO_PASSWORD: z.string().default('resend-demo'),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);

/**
 * Fatal safety checks run once at startup (see index.ts) — never at import, so
 * tests can construct the app freely. Demo login must never be reachable in a
 * production deployment: fail loudly rather than expose password accounts.
 */
export function assertRuntimeSafety(e: Env = env): void {
  if (e.DEMO_MODE && e.NODE_ENV === 'production') {
    throw new Error(
      'DEMO_MODE must not be enabled when NODE_ENV=production. Demo login ' +
        'exposes shared password accounts and is for demonstration only.',
    );
  }
  if (e.NODE_ENV === 'production' && !e.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required in production.');
  }
}

/**
 * The secret used to sign session cookies. In production this must be set; in
 * development/test a stable per-process fallback keeps local sign-in working
 * without configuration.
 */
let sessionSecretFallback: string | undefined;
export function sessionSecret(): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  sessionSecretFallback ??= `dev-only-${Math.random().toString(36).slice(2)}`;
  return sessionSecretFallback;
}
