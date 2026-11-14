import { randomUUID } from 'node:crypto';
import { asc, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  analyseCaseImport,
  londonToday,
  type CaseImportAnalysis,
  type CaseImportContext,
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
import { recordAudit } from './audit';
import { nextReference, toDisplayName } from './create-case';

export class ImportChanged extends Error {}

/** What is already on the system, for matching and the duplicate check. */
async function importContext(today: string): Promise<CaseImportContext> {
  const db = getDb();
  const caseClient = alias(clients, 'case_client');
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
        clientName: caseClient.fullName,
        childName: caseChild.fullName,
        dateOfEnquiry: cases.dateOfEnquiry,
      })
      .from(cases)
      .leftJoin(caseClient, eq(caseClient.id, cases.clientId))
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

/** Check a case list against the system: what would be imported, and why not. */
export async function previewCaseImport(
  request: CaseImportRequest,
): Promise<CaseImportAnalysis> {
  return analyseCaseImport(
    request,
    await importContext(londonToday(new Date())),
  );
}

export interface CaseImportResult {
  batchId: string;
  casesCreated: number;
  clientsCreated: number;
  childrenCreated: number;
  duplicatesSkipped: number;
  problemsSkipped: number;
}

/**
 * Import the rows that are ready, all together: either every one of them is
 * imported or (on any failure) none is. The list is checked again here, and
 * if it no longer gives the number of cases the admin saw in the preview —
 * someone added a case meanwhile, say — nothing is imported and they are
 * asked to check again. Every case is audited as created by import, with the
 * batch and spreadsheet row it came from; the import itself is audited with
 * its counts. No names or case content go in the audit's import summary.
 */
export async function commitCaseImport(
  request: CaseImportRequest,
  expectedToImport: number,
  actor: string,
): Promise<CaseImportResult> {
  const db = getDb();
  const batchId = randomUUID();
  return db.transaction(async (tx) => {
    // One import at a time, so two admins cannot import the same list twice.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('case_import'))`,
    );
    const today = londonToday(new Date());
    const analysis = analyseCaseImport(request, await importContext(today));
    if (analysis.summary.toImport !== expectedToImport)
      throw new ImportChanged(
        'The case list or the system has changed since you checked it. Check it again before importing.',
      );

    const teamRows = await tx
      .select({ id: teams.id, code: teams.code })
      .from(teams);
    const teamId = new Map(teamRows.map((t) => [t.code, t.id]));
    const newClientIds = new Map<string, string>();
    const newChildIds = new Map<string, string>();
    let clientsCreated = 0;
    let childrenCreated = 0;
    let casesCreated = 0;

    for (const row of analysis.rows) {
      const plan = row.plan;
      if (row.outcome !== 'import' || !plan) continue;

      let clientId: string | null = null;
      if (plan.client.kind === 'existing') clientId = plan.client.id;
      else if (plan.client.kind === 'new' && plan.clientFields) {
        clientId = newClientIds.get(plan.client.key) ?? null;
        if (!clientId) {
          const [c] = await tx
            .insert(clients)
            .values({
              ...plan.clientFields,
              displayName: toDisplayName(plan.clientFields.fullName),
            })
            .returning({ id: clients.id });
          clientId = c!.id;
          newClientIds.set(plan.client.key, clientId);
          clientsCreated += 1;
        }
      }

      let childId: string | null = null;
      if (plan.child.kind === 'existing') childId = plan.child.id;
      else if (plan.child.kind === 'new' && plan.childFields) {
        childId = newChildIds.get(plan.child.key) ?? null;
        if (!childId) {
          const [c] = await tx
            .insert(children)
            .values(plan.childFields)
            .returning({ id: children.id });
          childId = c!.id;
          newChildIds.set(plan.child.key, childId);
          childrenCreated += 1;
        }
      }
      if (clientId && childId)
        await tx
          .insert(clientChildren)
          .values({ clientId, childId, relationship: 'Parent' })
          .onConflictDoNothing();

      // Referenced by the year of enquiry, like a case added at the time.
      const caseReference = await nextReference(
        tx,
        plan.dateOfEnquiry.slice(0, 4),
      );
      const [kase] = await tx
        .insert(cases)
        .values({
          caseReference,
          clientId,
          childId,
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
        })
        .returning({ id: cases.id });
      const caseId = kase!.id;
      const links = plan.teams
        .map((code) => teamId.get(code))
        .filter((id): id is string => Boolean(id))
        .map((id) => ({ caseId, teamId: id }));
      if (links.length) await tx.insert(caseTeams).values(links);
      if (plan.note)
        await tx.insert(caseNotes).values({
          caseId,
          authorUserId: actor,
          entryDate: plan.note.date,
          body: plan.note.body,
        });
      await recordAudit(tx, {
        actorUserId: actor,
        action: 'case.create',
        entityType: 'case',
        entityId: caseId,
        after: {
          caseReference,
          clientId,
          childId,
          source: 'import',
          batchId,
          rowNumber: row.rowNumber,
        },
      });
      casesCreated += 1;
    }

    const result: CaseImportResult = {
      batchId,
      casesCreated,
      clientsCreated,
      childrenCreated,
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
