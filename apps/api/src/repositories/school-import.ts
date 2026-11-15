import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import {
  planSchoolImport,
  schoolNameKey,
  type ExistingSchool,
  type ImportedSchool,
  type SchoolImportPreview,
  type SchoolImportResult,
} from '@re-send/shared';
import { getDb } from '../db/client';
import { schools } from '../db/schema';
import { recordAudit, recordAudits, type AuditEntry } from './audit';
import { followSchoolChange } from './schools';

/** Postgres allows 65,535 parameters a statement; a school row uses about 15. */
const INSERT_CHUNK = 1000;

async function directory(
  db: Pick<ReturnType<typeof getDb>, 'select'>,
): Promise<ExistingSchool[]> {
  const rows = await db
    .select({
      id: schools.id,
      urn: schools.urn,
      name: schools.name,
      address: schools.address,
      postcode: schools.postcode,
      localAuthority: schools.localAuthority,
      phone: schools.phone,
      website: schools.website,
      funding: schools.funding,
      provision: schools.provision,
      section41: schools.section41,
      ageFrom: schools.ageFrom,
      ageTo: schools.ageTo,
      deletedAt: schools.deletedAt,
    })
    .from(schools);
  return rows.map(({ deletedAt, ...r }) => ({
    ...r,
    archived: deletedAt !== null,
  }));
}

/** How many changed schools a preview lists, beyond those matched by name. */
const PREVIEW_UPDATES = 300;

/** What importing these schools would do. Changes nothing. */
export async function previewSchoolImport(
  incoming: ImportedSchool[],
): Promise<SchoolImportPreview> {
  const plan = planSchoolImport(incoming, await directory(getDb()));
  return {
    toCreate: plan.create.length,
    toUpdate: plan.update.length,
    unchanged: plan.unchanged,
    repeated: plan.repeated,
    matchedByName: plan.update.filter((u) => u.matchedBy === 'name'),
    updates: plan.update
      .filter((u) => u.matchedBy === 'urn')
      .slice(0, PREVIEW_UPDATES),
  };
}

/**
 * Import the schools: new ones added, existing ones' facts refreshed (and a
 * URN given to a school added by hand without one). Planned again against the
 * directory as it is now, in one transaction, so it can be run again safely —
 * a second run changes nothing. Every school added or changed is audited, and
 * the import itself with its counts.
 */
export async function commitSchoolImport(
  incoming: ImportedSchool[],
  actor: string,
): Promise<SchoolImportResult> {
  const db = getDb();
  const batchId = randomUUID();
  try {
    return await importInTransaction(db, incoming, actor, batchId);
  } catch (err) {
    // A school saved with one of these URNs by someone else mid-import.
    if ((err as { code?: string }).code === '23505')
      throw new SchoolImportConflict(
        'A school with one of these URNs was added while importing. Check again, then import.',
      );
    throw err;
  }
}

export class SchoolImportConflict extends Error {}

async function importInTransaction(
  db: ReturnType<typeof getDb>,
  incoming: ImportedSchool[],
  actor: string,
  batchId: string,
): Promise<SchoolImportResult> {
  return db.transaction(async (tx) => {
    // One import at a time: two at once would both add the same schools.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('re-send:school-import'))`,
    );
    const plan = planSchoolImport(incoming, await directory(tx));
    const audits: AuditEntry[] = [];

    for (let i = 0; i < plan.create.length; i += INSERT_CHUNK) {
      const chunk = plan.create.slice(i, i + INSERT_CHUNK);
      const ids = await tx
        .insert(schools)
        .values(chunk.map((s) => ({ ...s, nameKey: schoolNameKey(s.name) })))
        .returning({ id: schools.id, urn: schools.urn });
      for (const row of ids)
        audits.push({
          actorUserId: actor,
          action: 'school.create',
          entityType: 'school',
          entityId: row.id,
          after: { urn: row.urn, source: 'dfe_import', batchId },
        });
    }

    if (plan.update.length) {
      const ids = plan.update.map((u) => u.id);
      const before = new Map<
        string,
        { name: string; address: string | null; postcode: string | null }
      >();
      for (let i = 0; i < ids.length; i += INSERT_CHUNK) {
        const rows = await tx
          .select({
            id: schools.id,
            name: schools.name,
            address: schools.address,
            postcode: schools.postcode,
          })
          .from(schools)
          .where(inArray(schools.id, ids.slice(i, i + INSERT_CHUNK)));
        for (const r of rows) before.set(r.id, r);
      }
      for (const u of plan.update) {
        const set: Record<string, unknown> = {};
        const was: Record<string, unknown> = {};
        for (const [field, change] of Object.entries(u.changes)) {
          set[field] = change!.to;
          was[field] = change!.from;
        }
        if (set.name) set.nameKey = schoolNameKey(String(set.name));
        await tx
          .update(schools)
          .set({ ...set, updatedAt: new Date() })
          .where(eq(schools.id, u.id));
        audits.push({
          actorUserId: actor,
          action: 'school.edit',
          entityType: 'school',
          entityId: u.id,
          before: was,
          after: {
            ...Object.fromEntries(
              Object.entries(u.changes).map(([k, c]) => [k, c!.to]),
            ),
            source: 'dfe_import',
            batchId,
          },
        });
        const prior = before.get(u.id);
        if (
          prior &&
          ('name' in u.changes ||
            'address' in u.changes ||
            'postcode' in u.changes)
        )
          await followSchoolChange(tx, u.id, prior, actor);
      }
    }

    await recordAudits(tx, audits);
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'school.import',
      entityType: 'school_import',
      entityId: batchId,
      after: {
        source: 'dfe',
        sent: incoming.length,
        created: plan.create.length,
        updated: plan.update.length,
        unchanged: plan.unchanged,
      },
    });
    return {
      batchId,
      created: plan.create.length,
      updated: plan.update.length,
      unchanged: plan.unchanged,
    };
  });
}
