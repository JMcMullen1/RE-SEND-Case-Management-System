import postgres from 'postgres';
import { z } from 'zod';
import { env } from './env';
import { dispatchEntityChange } from './realtime';

const PayloadSchema = z.object({
  entity: z.string(),
  id: z.string().nullable(),
  scopeId: z.string().nullable().optional(),
  op: z.string(),
});

/**
 * The single LISTEN connection. Every Postgres entity_change notification is
 * fanned out to this instance's WebSocket clients. Returns a stop function.
 */
export async function startEntityListener(): Promise<() => Promise<void>> {
  if (!env.DATABASE_URL) return async () => {};
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  await sql.listen('entity_change', (raw) => {
    try {
      const payload = PayloadSchema.parse(JSON.parse(raw));
      dispatchEntityChange(payload.entity, payload.id, payload.scopeId ?? null);
    } catch {
      /* ignore malformed notifications */
    }
  });
  return async () => {
    await sql.end();
  };
}
