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
  UPLOAD_DIR: z.string().default('.uploads'),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
