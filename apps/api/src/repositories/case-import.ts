import { createHash, randomUUID } from 'node:crypto';
import { asc, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  analyseCaseImport,
  londonToday,
  type CaseImportAnalysis,
  type CaseImportContext,
  type CaseImportPlan,
  type CaseImportRequest,
} from '@re-send/shared';
import { getDb } from '../db/client';
import {
  caseNotes,
  caseTeams,
  cases,
  children,
  clientChildren,
  clients,
  teams,
  users,
} from '../db/schema';
import { recordAudit, recordAudits, type AuditEntry } from './audit';
import { toDisplayName } from './create-case';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export class ImportChanged extends Error {}

/** What is already on the system, for matching and the duplicate check. */
async function importContext(today: string): Promise<CaseImportContext> {
  const db = getDb();
  const caseChild = alias(children, 'case_child');
  const [userRows, clientRows, childRows, caseRows] = await Promise.all([
    db
      .select({
        id: users.id,
        displayName: users.displayName,
        active: users.active,
      })
      .from(users)
      .orderBy(asc(users.displayName)),
    db
      .select({
        id: clients.id,
        fullName: clients.fullName,
        email: clients.email,
        postcode: clients.postcode,
      })
      .from(clients),
    db
      .select({
        clientId: clientChildren.clientId,
        childId: clientChildren.childId,
        fullName: children.fullName,
      })
      .from(clientChildren)
      .innerJoin(children, eq(children.id, clientChildren.childId)),
    db
      .select({
        caseReference: cases.caseReference,
        clientId: cases.clientId,
        childName: caseChild.fullName,
        dateOfEnquiry: cases.dateOfEnquiry,
      })
      .from(cases)
      .leftJoin(caseChild, eq(caseChild.id, cases.childId))
      .where(isNull(cases.deletedAt)),
  ]);
  return {
    today,
    users: userRows,
    clients: clientRows,
    children: childRows,
    cases: caseRows,
  };
}

/**
 * A fingerprint of exactly what was checked — the rows, the column matches and
 * the value matches — so the import runs on what the admin saw, never on a
 * changed list the preview did not show.
 */
export function importFingerprint(request: CaseImportRequest): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        request.firstRowNumber,
        request.mapping,
        Object.entries(request.valueMaps)
          .map(([field, map]) => [field, Object.entries(map ?? {}).sort()])
          .sort(),
        request.rows,
      ]),
    )
    .digest('hex');
}

/** Check a case list against the system: what would be imported, and why not. */
export async function previewCaseImport(
  request: CaseImportRequest,
): Promise<CaseImportAnalysis & { fingerprint: string }> {
  const analysis = analyseCaseImport(
    request,
    await importContext(londonToday(new Date())),
  );
  return { ...analysis, fingerprint: importFingerprint(request) };
}

export interface CaseImportResult {
  batchId: string;
  casesCreated: number;
  clientsCreated: number;
  childrenCreated: number;
  duplicatesSkipped: number;
  problemsSkipped: number;
}

const CHUNK = 500;

async function insertChunked<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK)
    await insert(rows.slice(i, i + CHUNK));
}

/** New ids from the database's own generator, in one query. */
async function newIds(tx: Tx, n: number): Promise<string[]> {
  if (n === 0) return [];
  const rows = (await tx.execute(
    sql`SELECT uuid_generate_v7()::text AS id FROM generate_series(1, ${n})`,
  )) as unknown as { id: string }[];
  return rows.map((r) => r.id);
}

/**
 * Import the rows that are ready, all together: either every one of them is
 * imported or (on any failure) none is. The list must be exactly the one
 * checked (the fingerprint), and checked again here it must still give the
 * number of cases the admin saw — if someone added a case meanwhile, nothing
 * is imported and they are asked to check again. Rows are written in bulk, so
 * a list of thousands takes seconds. Every case is audited as created by
 * import, with the batch and spreadsheet row it came from; the import itself
 * is audited with its counts (no names or case content).
 */
export async function commitCaseImport(
  request: CaseImportRequest,
  expected: { fingerprint: string; toImport: number },
  actor: string,
): Promise<CaseImportResult> {
  const changed = new ImportChanged(
    'The case list, its matches or the system have changed since you checked it. Check it again before importing.',
  );
  if (importFingerprint(request) !== expected.fingerprint) throw changed;
  const db = getDb();
  const batchId = randomUUID();
  return db.transaction(async (tx) => {
    // One import at a time, and case references allocated without a gap or
    // a clash with a case added by hand meanwhile.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('case_import'))`,
    );
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('case_reference'))`,
    );
    const today = londonToday(new Date());
    const analysis = analyseCaseImport(request, await importContext(today));
    if (analysis.summary.toImport !== expected.toImport) throw changed;
    const plans = analysis.rows.flatMap((r) =>
      r.outcome === 'import' && r.plan
        ? [{ rowNumber: r.rowNumber, plan: r.plan }]
        : [],
    );

    // New clients and children, one each per identity key.
    const clientKeys = new Map<
      string,
      NonNullable<CaseImportPlan['clientFields']>
    >();
    const childKeys = new Map<
      string,
      NonNullable<CaseImportPlan['childFields']>
    >();
    for (const { plan } of plans) {
      if (
        plan.client.kind === 'new' &&
        plan.clientFields &&
        !clientKeys.has(plan.client.key)
      )
        clientKeys.set(plan.client.key, plan.clientFields);
      if (
        plan.child.kind === 'new' &&
        plan.childFields &&
        !childKeys.has(plan.child.key)
      )
        childKeys.set(plan.child.key, plan.childFields);
    }
    const ids = await newIds(
      tx,
      clientKeys.size + childKeys.size + plans.length,
    );
    let next = 0;
    const clientId = new Map(
      [...clientKeys.keys()].map((k) => [k, ids[next++]!]),
    );
    const childId = new Map(
      [...childKeys.keys()].map((k) => [k, ids[next++]!]),
    );
    const caseIds = plans.map(() => ids[next++]!);

    await insertChunked([...clientKeys], (chunk) =>
      tx.insert(clients).values(
        chunk.map(([key, fields]) => ({
          id: clientId.get(key)!,
          ...fields,
          displayName: toDisplayName(fields.fullName),
        })),
      ),
    );
    await insertChunked([...childKeys], (chunk) =>
      tx
        .insert(children)
        .values(
          chunk.map(([key, fields]) => ({ id: childId.get(key)!, ...fields })),
        ),
    );

    // References run on from the highest for each year of enquiry.
    const nextRef = new Map<string, number>();
    for (const year of new Set(
      plans.map((p) => p.plan.dateOfEnquiry.slice(0, 4)),
    )) {
      const [row] = (await tx.execute(sql`
        SELECT coalesce(max((split_part(case_reference, '-', 3))::int), 1000) + 1 AS next
        FROM cases WHERE case_reference ~ ${'^RS-' + year + '-[0-9]+$'}
      `)) as unknown as { next: number }[];
      nextRef.set(year, Number(row?.next ?? 1001));
    }

    const teamRows = await tx
      .select({ id: teams.id, code: teams.code })
      .from(teams);
    const teamId = new Map(teamRows.map((t) => [t.code, t.id]));
    const links = new Map<string, { clientId: string; childId: string }>();
    const caseRows: (typeof cases.$inferInsert)[] = [];
    const teamLinks: { caseId: string; teamId: string }[] = [];
    const notes: (typeof caseNotes.$inferInsert)[] = [];
    const audits: AuditEntry[] = [];
    plans.forEach(({ rowNumber, plan }, i) => {
      const id = caseIds[i]!;
      const forClient =
        plan.client.kind === 'existing'
          ? plan.client.id
          : plan.client.kind === 'new'
            ? (clientId.get(plan.client.key) ?? null)
            : null;
      const forChild =
        plan.child.kind === 'existing'
          ? plan.child.id
          : plan.child.kind === 'new'
            ? (childId.get(plan.child.key) ?? null)
            : null;
      if (forClient && forChild)
        links.set(`${forClient}|${forChild}`, {
          clientId: forClient,
          childId: forChild,
        });
      const year = plan.dateOfEnquiry.slice(0, 4);
      const n = nextRef.get(year)!;
      nextRef.set(year, n + 1);
      const caseReference = `RS-${year}-${n}`;
      caseRows.push({
        id,
        caseReference,
        clientId: forClient,
        childId: forChild,
        dateOfEnquiry: plan.dateOfEnquiry,
        status: plan.status,
        ownerUserId: plan.ownerUserId,
        ownerQueue: plan.ownerQueue,
        shadowUserId: plan.shadowUserId,
        originalQuery: plan.originalQuery as never,
        methodOfEnquiry: plan.methodOfEnquiry as never,
        currentWork: plan.currentWork as never,
        appealNumber: plan.appealNumber,
        paymentCode: plan.paymentCode as never,
        discountCode: plan.discountCode as never,
        invoiceStatusText: plan.invoiceStatusText,
        accountingNotes: plan.accountingNotes,
      });
      for (const code of plan.teams) {
        const t = teamId.get(code);
        if (t) teamLinks.push({ caseId: id, teamId: t });
      }
      if (plan.note)
        notes.push({
          caseId: id,
          authorUserId: actor,
          entryDate: plan.note.date,
          body: plan.note.body,
        });
      audits.push({
        actorUserId: actor,
        action: 'case.create',
        entityType: 'case',
        entityId: id,
        after: {
          caseReference,
          clientId: forClient,
          childId: forChild,
          source: 'import',
          batchId,
          rowNumber,
        },
      });
    });

    await insertChunked([...links.values()], (chunk) =>
      tx
        .insert(clientChildren)
        .values(chunk.map((l) => ({ ...l, relationship: 'Parent' })))
        .onConflictDoNothing(),
    );
    await insertChunked(caseRows, (chunk) => tx.insert(cases).values(chunk));
    await insertChunked(teamLinks, (chunk) =>
      tx.insert(caseTeams).values(chunk),
    );
    await insertChunked(notes, (chunk) => tx.insert(caseNotes).values(chunk));
    await recordAudits(tx, audits);

    const result: CaseImportResult = {
      batchId,
      casesCreated: caseRows.length,
      clientsCreated: clientKeys.size,
      childrenCreated: childKeys.size,
      duplicatesSkipped: analysis.summary.duplicates,
      problemsSkipped: analysis.summary.problems,
    };
    await recordAudit(tx, {
      actorUserId: actor,
      action: 'import.cases',
      entityType: 'import',
      entityId: batchId,
      after: { ...result, rowsRead: analysis.summary.total },
    });
    return result;
  });
}
