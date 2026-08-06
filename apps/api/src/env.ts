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
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
