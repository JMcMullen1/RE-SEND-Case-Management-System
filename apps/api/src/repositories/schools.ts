import {
  and,
  asc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import {
  normalisePostcode,
  normaliseUrn,
  schoolNameKey,
  type CaseSchool,
  type CaseSchoolRole,
  type SchoolContact,
  type SchoolDetail,
  type SchoolFields,
  type SchoolFunding,
  type SchoolProvision,
  type SchoolSummary,
} from '@re-send/shared';
import { getDb } from '../db/client';
import {
  caseSchools,
  cases,
  children,
  schoolContacts,
  schools,
} from '../db/schema';
import { recordAudit } from './audit';

export class SchoolConflict extends Error {}
export class SchoolNotFound extends Error {}

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

// Drizzle leaves column references unqualified in a single-table select, which
// is ambiguous inside these subqueries; name the outer row explicitly.
const outerSchoolId = sql.raw('"schools"."id"');

const contactCount = sql<number>`(
  SELECT count(*)::int FROM ${schoolContacts} c
  WHERE c.school_id = ${outerSchoolId} AND c.deleted_at IS NULL
)`;
const caseCount = sql<number>`(
  SELECT count(DISTINCT l.case_id)::int FROM ${caseSchools} l
  JOIN ${cases} k ON k.id = l.case_id
  WHERE l.school_id = ${outerSchoolId} AND l.deleted_at IS NULL
    AND k.deleted_at IS NULL
)`;

const summaryColumns = {
  id: schools.id,
  name: schools.name,
  urn: schools.urn,
  address: schools.address,
  postcode: schools.postcode,
  localAuthority: schools.localAuthority,
  phone: schools.phone,
  email: schools.email,
  website: schools.website,
  funding: schools.funding,
  provision: schools.provision,
  section41: schools.section41,
  ageFrom: schools.ageFrom,
  ageTo: schools.ageTo,
  notes: schools.notes,
  archived: sql<boolean>`${schools.deletedAt} IS NOT NULL`,
  contactCount,
  caseCount,
};

export interface SchoolFilters {
  q?: string;
  section41?: boolean;
  funding?: SchoolFunding[];
  provision?: SchoolProvision[];
  includeArchived?: boolean;
}

/** Search the directory by name, URN, postcode, town or LA, with filters. */
export async function searchSchools(
  filters: SchoolFilters,
  limit = 200,
): Promise<SchoolSummary[]> {
  const conditions: SQL[] = [];
  if (!filters.includeArchived) conditions.push(isNull(schools.deletedAt));
  const q = filters.q?.trim();
  if (q) {
    const like = `%${q}%`;
    const key = schoolNameKey(q);
    conditions.push(
      or(
        ilike(schools.name, like),
        // Every word of the normalised query, in any order, so "saint marys
        // primary" finds "St Mary's C of E Primary School".
        key
          ? and(
              ...key
                .split(' ')
                .map((word) => ilike(schools.nameKey, `%${word}%`)),
            )!
          : sql`false`,
        ilike(schools.urn, like),
        ilike(schools.postcode, like),
        ilike(schools.address, like),
        ilike(schools.localAuthority, like),
      )!,
    );
  }
  if (filters.section41) conditions.push(eq(schools.section41, true));
  if (filters.funding?.length)
    conditions.push(inArray(schools.funding, filters.funding));
  if (filters.provision?.length)
    conditions.push(inArray(schools.provision, filters.provision));

  return getDb()
    .select(summaryColumns)
    .from(schools)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(schools.name))
    .limit(limit);
}

/** A school with its contacts and the live cases it is linked to. */
export async function getSchool(id: string): Promise<SchoolDetail | null> {
  const db = getDb();
  const [school] = await db
    .select(summaryColumns)
    .from(schools)
    .where(eq(schools.id, id));
  if (!school) return null;
  const contacts = await listContacts([id]);
  const links = await db
    .select({
      caseId: cases.id,
      caseReference: cases.caseReference,
      childName: sql<
        string | null
      >`coalesce(${children.preferredName}, ${children.fullName})`,
      role: caseSchools.role,
    })
    .from(caseSchools)
    .innerJoin(cases, eq(cases.id, caseSchools.caseId))
    .leftJoin(children, eq(children.id, cases.childId))
    .where(
      and(
        eq(caseSchools.schoolId, id),
        isNull(caseSchools.deletedAt),
        isNull(cases.deletedAt),
      ),
    )
    .orderBy(asc(cases.caseReference));
  return { ...school, contacts, cases: links };
}

async function listContacts(schoolIds: string[]): Promise<SchoolContact[]> {
  if (schoolIds.length === 0) return [];
  return getDb()
    .select({
      id: schoolContacts.id,
      schoolId: schoolContacts.schoolId,
      name: schoolContacts.name,
      role: schoolContacts.role,
      email: schoolContacts.email,
      phone: schoolContacts.phone,
      notes: schoolContacts.notes,
    })
    .from(schoolContacts)
    .where(
      and(
        inArray(schoolContacts.schoolId, schoolIds),
        isNull(schoolContacts.deletedAt),
      ),
    )
    .orderBy(asc(schoolContacts.name));
}

/** Normalise free-text fields: trimmed, empty → null; postcode and URN tidied. */
function clean(fields: Partial<SchoolFields>): Partial<SchoolFields> {
  const out: Partial<SchoolFields> = {};
  for (const [k, v] of Object.entries(fields) as [
    keyof SchoolFields,
    unknown,
  ][]) {
    if (v === undefined) continue;
    (out as Record<string, unknown>)[k] =
      typeof v === 'string' ? v.trim() || null : v;
  }
  if (fields.postcode !== undefined)
    out.postcode = normalisePostcode(fields.postcode);
  if (fields.urn !== undefined) out.urn = normaliseUrn(fields.urn);
  if (fields.name !== undefined) out.name = fields.name.trim();
  return out;
}

/**
 * Schools that look like the same one: the same URN, or the same normalised
 * name (in the same postcode, when both have one). Used to warn before a
 * duplicate is added. Archived schools are included so they can be restored.
 */
export async function findLikelyDuplicates(
  fields: { name: string; urn?: string | null; postcode?: string | null },
  excludeId?: string,
): Promise<SchoolSummary[]> {
  const urn = normaliseUrn(fields.urn);
  const postcode = normalisePostcode(fields.postcode);
  const key = schoolNameKey(fields.name);
  const byName = key
    ? and(
        eq(schools.nameKey, key),
        postcode
          ? or(isNull(schools.postcode), eq(schools.postcode, postcode))
          : undefined,
      )
    : undefined;
  const match = urn ? or(eq(schools.urn, urn), byName) : byName;
  if (!match) return [];
  return getDb()
    .select(summaryColumns)
    .from(schools)
    .where(
      and(match, excludeId ? sql`${schools.id} <> ${excludeId}` : undefined),
    )
    .limit(5);
}

/**
 * Add a school. Unless `force` is set, a likely duplicate is refused with the
 * matches so the person can pick the existing school instead. A URN already in
 * use is always refused.
 */
export async function createSchool(
  fields: SchoolFields,
  actor: string,
  force = false,
): Promise<{ school: SchoolDetail } | { duplicates: SchoolSummary[] }> {
  const values = clean(fields) as SchoolFields;
  const dupes = await findLikelyDuplicates(values);
  if (values.urn && dupes.some((d) => d.urn === values.urn)) {
    return { duplicates: dupes.filter((d) => d.urn === values.urn) };
  }
  if (dupes.length && !force) return { duplicates: dupes };

  const db = getDb();
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schools)
      .values({ ...values, nameKey: schoolNameKey(values.name) })
      .returning({ id: schools.id });
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'school.create',
      entityType: 'school',
      entityId: row!.id,
      after: { name: values.name, urn: values.urn },
    });
    return row!.id;
  });
  return { school: (await getSchool(id))! };
}

/** Edit a school's facts (audited, with the before and after of each change). */
export async function updateSchool(
  id: string,
  patch: Partial<SchoolFields>,
  actor: string,
): Promise<SchoolDetail> {
  const db = getDb();
  const values = clean(patch);
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(schools)
      .where(eq(schools.id, id))
      .for('update');
    if (!before) throw new SchoolNotFound('School not found');
    if (values.urn) {
      const [clash] = await tx
        .select({ id: schools.id })
        .from(schools)
        .where(
          and(
            eq(schools.urn, values.urn),
            isNull(schools.deletedAt),
            sql`${schools.id} <> ${id}`,
          ),
        );
      if (clash)
        throw new SchoolConflict('Another school already has this URN.');
    }
    const changed: Record<string, unknown> = {};
    const was: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      const prior = (before as Record<string, unknown>)[k];
      if (prior !== v) {
        changed[k] = v;
        was[k] = prior;
      }
    }
    if (Object.keys(changed).length === 0) return;
    await tx
      .update(schools)
      .set({
        ...changed,
        ...(values.name ? { nameKey: schoolNameKey(values.name) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schools.id, id));
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'school.edit',
      entityType: 'school',
      entityId: id,
      before: was,
      after: changed,
    });
  });
  return (await getSchool(id))!;
}

/** Archive (soft-delete) or restore a school. Linked cases keep the link. */
export async function setSchoolArchived(
  id: string,
  archived: boolean,
  actor: string,
): Promise<SchoolDetail> {
  const db = getDb();
  const [row] = await db
    .update(schools)
    .set({ deletedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(eq(schools.id, id))
    .returning({ id: schools.id });
  if (!row) throw new SchoolNotFound('School not found');
  await recordAudit(db, {
    actorUserId: actor,
    action: archived ? 'school.archive' : 'school.restore',
    entityType: 'school',
    entityId: id,
  });
  return (await getSchool(id))!;
}

// --- Contacts -------------------------------------------------------------------

export interface ContactFields {
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

function cleanContact(f: Partial<ContactFields>): Partial<ContactFields> {
  const out: Partial<ContactFields> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined) continue;
    (out as Record<string, unknown>)[k] =
      typeof v === 'string' ? v.trim() || null : v;
  }
  return out;
}

export async function addContact(
  schoolId: string,
  fields: ContactFields,
  actor: string,
): Promise<SchoolContact> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [school] = await tx
      .select({ id: schools.id })
      .from(schools)
      .where(eq(schools.id, schoolId));
    if (!school) throw new SchoolNotFound('School not found');
    const values = cleanContact(fields) as ContactFields;
    const [row] = await tx
      .insert(schoolContacts)
      .values({ ...values, schoolId })
      .returning();
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'school_contact.create',
      entityType: 'school_contact',
      entityId: row!.id,
      after: { schoolId, role: values.role },
    });
    return {
      id: row!.id,
      schoolId,
      name: row!.name,
      role: row!.role,
      email: row!.email,
      phone: row!.phone,
      notes: row!.notes,
    };
  });
}

export async function updateContact(
  id: string,
  patch: Partial<ContactFields>,
  actor: string,
): Promise<SchoolContact> {
  const db = getDb();
  const values = cleanContact(patch);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(schoolContacts)
      .where(and(eq(schoolContacts.id, id), isNull(schoolContacts.deletedAt)))
      .for('update');
    if (!before) throw new SchoolNotFound('Contact not found');
    const [row] = await tx
      .update(schoolContacts)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schoolContacts.id, id))
      .returning();
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'school_contact.edit',
      entityType: 'school_contact',
      entityId: id,
      before: Object.fromEntries(
        Object.keys(values).map((k) => [
          k,
          (before as Record<string, unknown>)[k],
        ]),
      ),
      after: values,
    });
    return {
      id: row!.id,
      schoolId: row!.schoolId,
      name: row!.name,
      role: row!.role,
      email: row!.email,
      phone: row!.phone,
      notes: row!.notes,
    };
  });
}

/** Remove a contact (soft, audited); it is also dropped from case links. */
export async function removeContact(id: string, actor: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schoolContacts)
      .set({ deletedAt: new Date() })
      .where(and(eq(schoolContacts.id, id), isNull(schoolContacts.deletedAt)))
      .returning({ id: schoolContacts.id, schoolId: schoolContacts.schoolId });
    if (!row) throw new SchoolNotFound('Contact not found');
    await tx
      .update(caseSchools)
      .set({
        contactIds: sql`array_remove(${caseSchools.contactIds}, ${id}::uuid)`,
        updatedAt: new Date(),
      })
      .where(sql`${id}::uuid = ANY(${caseSchools.contactIds})`);
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'school_contact.delete',
      entityType: 'school_contact',
      entityId: id,
      before: { schoolId: row.schoolId },
    });
  });
}

// --- Case links -------------------------------------------------------------------

/** The schools linked to a case, current first, with their contacts. */
export async function listCaseSchools(caseId: string): Promise<CaseSchool[]> {
  const db = getDb();
  const links = await db
    .select({
      linkId: caseSchools.id,
      role: caseSchools.role,
      schoolId: caseSchools.schoolId,
      contactIds: caseSchools.contactIds,
    })
    .from(caseSchools)
    .where(and(eq(caseSchools.caseId, caseId), isNull(caseSchools.deletedAt)))
    .orderBy(asc(caseSchools.role), asc(caseSchools.createdAt));
  if (links.length === 0) return [];
  const ids = [...new Set(links.map((l) => l.schoolId))];
  const rows = await db
    .select(summaryColumns)
    .from(schools)
    .where(inArray(schools.id, ids));
  const contacts = await listContacts(ids);
  return links.map((l) => ({
    linkId: l.linkId,
    role: l.role,
    school: rows.find((r) => r.id === l.schoolId)!,
    contacts: contacts.filter((c) => c.schoolId === l.schoolId),
    involvedContactIds: l.contactIds,
  }));
}

/** The child's free-text school field each link role keeps in step. */
const SYNCED_FIELD: Partial<
  Record<CaseSchoolRole, 'currentSchoolName' | 'desiredSchool'>
> = {
  current: 'currentSchoolName',
  proposed: 'desiredSchool',
};

/**
 * Keep the child's "Current school" / "Desired school" text in step with a
 * current / proposed link, so the case list, smart fill and corpus (which read
 * those fields) say the same as the directory. Audited as a child edit.
 */
async function syncChildSchoolField(
  tx: Tx,
  caseId: string,
  role: CaseSchoolRole,
  schoolName: string,
  actor: string,
): Promise<void> {
  const field = SYNCED_FIELD[role];
  if (!field) return;
  const [row] = await tx
    .select({ childId: cases.childId })
    .from(cases)
    .where(eq(cases.id, caseId));
  if (!row?.childId) return;
  const [child] = await tx
    .select({ value: children[field] })
    .from(children)
    .where(eq(children.id, row.childId));
  if (!child || child.value === schoolName) return;
  await tx
    .update(children)
    .set({ [field]: schoolName, updatedAt: new Date() })
    .where(eq(children.id, row.childId));
  await recordAudit(tx, {
    actorUserId: actor,
    action: 'child.edit',
    entityType: 'child',
    entityId: row.childId,
    before: { [field]: child.value },
    after: { [field]: schoolName, source: 'school_link' },
  });
}

/** Link a school to a case in a role. Linking the same school in the same role again is a no-op. */
export async function linkSchool(
  caseId: string,
  schoolId: string,
  role: CaseSchoolRole,
  actor: string,
): Promise<CaseSchool[]> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [school] = await tx
      .select({ name: schools.name })
      .from(schools)
      .where(and(eq(schools.id, schoolId), isNull(schools.deletedAt)));
    if (!school) throw new SchoolNotFound('School not found');
    const [kase] = await tx
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.id, caseId), isNull(cases.deletedAt)));
    if (!kase) throw new SchoolNotFound('Case not found');

    const [row] = await tx
      .insert(caseSchools)
      .values({ caseId, schoolId, role })
      .onConflictDoNothing()
      .returning({ id: caseSchools.id });
    if (!row) return;
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'case_school.link',
      entityType: 'case_school',
      entityId: row.id,
      after: { caseId, schoolId, role },
    });
    await syncChildSchoolField(tx, caseId, role, school.name, actor);
  });
  return listCaseSchools(caseId);
}

/** Change a link's role or the contacts involved (audited). */
export async function updateCaseSchool(
  caseId: string,
  linkId: string,
  patch: { role?: CaseSchoolRole; contactIds?: string[] },
  actor: string,
): Promise<CaseSchool[]> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(caseSchools)
      .where(
        and(
          eq(caseSchools.id, linkId),
          eq(caseSchools.caseId, caseId),
          isNull(caseSchools.deletedAt),
        ),
      )
      .for('update');
    if (!before) throw new SchoolNotFound('Link not found');

    let contactIds = patch.contactIds;
    if (contactIds) {
      // Only live contacts of this school may be marked as involved.
      const valid = contactIds.length
        ? await tx
            .select({ id: schoolContacts.id })
            .from(schoolContacts)
            .where(
              and(
                inArray(schoolContacts.id, contactIds),
                eq(schoolContacts.schoolId, before.schoolId),
                isNull(schoolContacts.deletedAt),
              ),
            )
        : [];
      contactIds = valid.map((v) => v.id);
    }
    try {
      await tx
        .update(caseSchools)
        .set({
          ...(patch.role ? { role: patch.role } : {}),
          ...(contactIds ? { contactIds } : {}),
          updatedAt: new Date(),
        })
        .where(eq(caseSchools.id, linkId));
    } catch (err) {
      if ((err as { code?: string }).code === '23505')
        throw new SchoolConflict('This school is already linked in that role.');
      throw err;
    }
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'case_school.edit',
      entityType: 'case_school',
      entityId: linkId,
      before: { role: before.role, contactIds: before.contactIds },
      after: { role: patch.role, contactIds },
    });
    if (patch.role && patch.role !== before.role) {
      const [school] = await tx
        .select({ name: schools.name })
        .from(schools)
        .where(eq(schools.id, before.schoolId));
      await syncChildSchoolField(tx, caseId, patch.role, school!.name, actor);
    }
  });
  return listCaseSchools(caseId);
}

/** Unlink a school from a case (soft, audited). */
export async function unlinkSchool(
  caseId: string,
  linkId: string,
  actor: string,
): Promise<CaseSchool[]> {
  const db = getDb();
  const [row] = await db
    .update(caseSchools)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(caseSchools.id, linkId),
        eq(caseSchools.caseId, caseId),
        isNull(caseSchools.deletedAt),
      ),
    )
    .returning({ schoolId: caseSchools.schoolId, role: caseSchools.role });
  if (!row) throw new SchoolNotFound('Link not found');
  await recordAudit(db, {
    actorUserId: actor,
    action: 'case_school.unlink',
    entityType: 'case_school',
    entityId: linkId,
    before: { caseId, schoolId: row.schoolId, role: row.role },
  });
  return listCaseSchools(caseId);
}
