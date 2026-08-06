import { auditLog } from '../db/schema';
import { getDb } from '../db/client';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface AuditEntry {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Record a state change. Every mutation path calls this so the system stays
 * fully auditable. Callers pass identifiers and the before/after of the field
 * that changed — not application-log free text.
 */
export async function recordAudit(
  tx: Db | Tx,
  entry: AuditEntry,
): Promise<void> {
  await tx.insert(auditLog).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
