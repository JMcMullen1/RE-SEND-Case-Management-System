import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import * as schema from './schema';

/**
 * The single database connection. This module — and the repositories that use
 * it — are the ONLY place database access is allowed. Nothing outside
 * apps/api/src/repositories may import this.
 */
let client: ReturnType<typeof postgres> | undefined;

export function getDb() {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  client ??= postgres(env.DATABASE_URL);
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof getDb>;
