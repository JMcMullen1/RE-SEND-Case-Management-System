import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { londonToday, type CaseClientDetail, type Team } from '@re-send/shared';
import { getDb } from '../db/client';
import { extractIntakeText } from '../ai/intake';
import { getStorageProvider } from '../storage';
import {
  caseNotes,
  caseTeams,
  cases,
  children,
  clientChildren,
  clients,
  documents,
  keyDates,
  teams,
  users,
} from '../db/schema';
import { recordAudit } from './audit';

export interface IntakeAttachment {
  storageKey: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
}

export interface CreateCaseInput {
  existingClientId?: string;
  client?: Partial<typeof clients.$inferInsert> & {
    fullName?: string;
    consentDataProcessing?: boolean;
    consentInformationSharing?: boolean;
    consentContact?: boolean;
    consentPrivacyNotice?: boolean;
    paymentPlanRequired?: boolean;
  };
  existingChildId?: string;
  child?: Partial<typeof children.$inferInsert> & { fullName?: string };
  case: {
    dateOfEnquiry?: string;
    currentWork: string;
    originalQuery?: string | null;
    methodOfEnquiry?: string | null;
    team?: Team[];
    ownerUserId?: string | null;
    ownerQueue?: string | null;
    status?: string;
    consultStatus?: string;
    supportLevel?: string | null;
    paymentCode?: string | null;
    discountCode?: string | null;
    aims?: string | null;
    finalPlanIssuedDate?: string | null;
    mediationStatus?: string | null;
    appealLodged?: boolean;
    representationWanted?: boolean;
  };
  firstNote?: string;
  /** Key dates a smart-filled form implied — created with the case. */
  keyDates?: {
    date: string;
    title: string;
    type: string;
    confidence?: number;
  }[];
  /** The original submission, already in storage — attached as a document. */
  intake?: IntakeAttachment;
}

/** Timestamp a consent only when it was granted. */
function consentAt(granted: boolean | undefined, at: Date) {
  return granted ? at : null;
}

function confidenceBucket(c: number | undefined): string | null {
  if (c === undefined) return null;
  if (c >= 0.8) return 'high';
  if (c >= 0.5) return 'medium';
  return 'low';
}

/** "Nadia Rahman" -> "Rahman, Nadia"; single-word names pass through. */
function toDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName.trim();
  const last = parts[parts.length - 1]!;
  const rest = parts.slice(0, -1).join(' ');
  return `${last}, ${rest}`;
}

async function nextReference(
  tx: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
  year: string,
): Promise<string> {
  const result = await tx.execute(sql`
    SELECT coalesce(max((split_part(case_reference, '-', 3))::int), 1000) + 1 AS next
    FROM cases
    WHERE case_reference ~ ${'^RS-' + year + '-[0-9]+$'}
  `);
  const next = (result as unknown as { next: number }[])[0]?.next ?? 1001;
  return `RS-${year}-${next}`;
}

export async function createCase(
  input: CreateCaseInput,
  actor: string | null,
): Promise<{ caseId: string; caseReference: string }> {
  const db = getDb();
  const today = londonToday(new Date());
  const now = new Date();

  // Resolve the intake submission before the transaction: fetch its bytes from
  // storage, re-derive size and hash from the actual object (the client only
  // hands back an opaque key), and re-extract text for the document's corpus.
  const resolvedIntake = await resolveIntake(input.intake);

  return db.transaction(async (tx) => {
    // Client
    let clientId = input.existingClientId ?? null;
    if (!clientId && input.client?.fullName) {
      const [row] = await tx
        .insert(clients)
        .values({
          ...input.client,
          fullName: input.client.fullName,
          displayName:
            input.client.displayName ?? toDisplayName(input.client.fullName),
          consentDataProcessingAt: consentAt(
            input.client.consentDataProcessing,
            now,
          ),
          consentInformationSharingAt: consentAt(
            input.client.consentInformationSharing,
            now,
          ),
          consentContactAt: consentAt(input.client.consentContact, now),
          consentPrivacyNoticeAt: consentAt(
            input.client.consentPrivacyNotice,
            now,
          ),
        })
        .returning({ id: clients.id });
      clientId = row!.id;
    }

    // Child
    let childId = input.existingChildId ?? null;
    if (!childId && input.child?.fullName) {
      const [row] = await tx
        .insert(children)
        .values({ ...input.child, fullName: input.child.fullName })
        .returning({ id: children.id });
      childId = row!.id;
    }

    // Link client and child (idempotent).
    if (clientId && childId) {
      await tx
        .insert(clientChildren)
        .values({ clientId, childId, relationship: 'Parent' })
        .onConflictDoNothing();
    }

    const c = input.case;
    // Owner: a named user, or a queue. Default to the Enquiries queue so the
    // owner check constraint is always satisfied.
    const ownerUserId = c.ownerUserId ?? null;
    const ownerQueue = ownerUserId ? null : (c.ownerQueue ?? 'Enquiries');

    const caseReference = await nextReference(tx, today.slice(0, 4));

    const [caseRow] = await tx
      .insert(cases)
      .values({
        caseReference,
        clientId,
        childId,
        dateOfEnquiry: c.dateOfEnquiry ?? today,
        currentWork: c.currentWork as never,
        originalQuery: (c.originalQuery ?? null) as never,
        methodOfEnquiry: (c.methodOfEnquiry ?? null) as never,
        ownerUserId,
        ownerQueue: ownerQueue as never,
        status: (c.status ?? 'Enquiry') as never,
        consultStatus: (c.consultStatus ?? 'not_required') as never,
        supportLevel: c.supportLevel ?? null,
        paymentCode: (c.paymentCode ?? null) as never,
        discountCode: (c.discountCode ?? null) as never,
        aims: c.aims ?? null,
        finalPlanIssuedDate: c.finalPlanIssuedDate ?? null,
        mediationStatus: c.mediationStatus ?? null,
        appealLodged: c.appealLodged ?? false,
        representationWanted: c.representationWanted ?? false,
      })
      .returning({ id: cases.id });
    const caseId = caseRow!.id;

    if (c.team && c.team.length > 0) {
      const teamRows = await tx
        .select({ id: teams.id, code: teams.code })
        .from(teams);
      const byCode = new Map(teamRows.map((t) => [t.code, t.id]));
      const links = c.team
        .map((code) => byCode.get(code))
        .filter((id): id is string => Boolean(id))
        .map((teamId) => ({ caseId, teamId }));
      if (links.length) await tx.insert(caseTeams).values(links);
    }

    if (input.firstNote && input.firstNote.trim() && actor) {
      await tx.insert(caseNotes).values({
        caseId,
        authorUserId: actor,
        entryDate: today,
        body: input.firstNote.trim(),
      });
    }

    // Key dates the smart-filled form implied.
    let keyDatesCreated = 0;
    if (input.keyDates && input.keyDates.length > 0) {
      await tx.insert(keyDates).values(
        input.keyDates.map((k) => ({
          caseId,
          date: k.date,
          title: k.title,
          type: k.type as never,
          source: 'jotform' as const,
          confidence: confidenceBucket(k.confidence),
        })),
      );
      keyDatesCreated = input.keyDates.length;
    }

    // Attach the original submission as a document on the new case.
    let documentId: string | null = null;
    if (resolvedIntake) {
      const uploader = actor ?? (await anyUserId(tx));
      if (uploader) {
        const [doc] = await tx
          .insert(documents)
          .values({
            storageKey: resolvedIntake.storageKey,
            originalFilename: resolvedIntake.filename,
            mimeType: resolvedIntake.mimeType,
            byteSize: resolvedIntake.byteSize,
            sha256: resolvedIntake.sha256,
            uploadedByUserId: uploader,
            category: 'Correspondence',
            caseId,
            extractedText: resolvedIntake.extractedText,
            documentGroupId: randomUUID(),
            version: 1,
          })
          .returning({ id: documents.id });
        documentId = doc!.id;
      }
    }

    await recordAudit(tx, {
      actorUserId: actor,
      action: 'case.create',
      entityType: 'case',
      entityId: caseId,
      after: {
        caseReference,
        clientId,
        childId,
        attachedToExistingClient: Boolean(input.existingClientId),
        smartFilled: Boolean(resolvedIntake),
        keyDatesCreated,
        intakeDocumentAttached: Boolean(documentId),
      },
    });

    return { caseId, caseReference };
  });
}

interface ResolvedIntake {
  storageKey: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  extractedText: string | null;
}

/** Fetch the stored submission and re-derive its metadata from the bytes. */
async function resolveIntake(
  intake: IntakeAttachment | undefined,
): Promise<ResolvedIntake | null> {
  if (!intake || !intake.storageKey.startsWith('intake/')) return null;
  const object = await getStorageProvider().get(intake.storageKey);
  if (!object) return null;
  const extractedText = await extractIntakeText(
    intake.mimeType,
    object.body,
    intake.filename,
  );
  return {
    storageKey: intake.storageKey,
    filename: intake.filename,
    mimeType: intake.mimeType,
    byteSize: object.body.byteLength,
    sha256: createHash('sha256').update(object.body).digest('hex'),
    extractedText: extractedText || null,
  };
}

async function anyUserId(
  tx: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
): Promise<string | null> {
  const [row] = await tx.select({ id: users.id }).from(users).limit(1);
  return row?.id ?? null;
}

// --- Duplicate detection ----------------------------------------------------

export interface MatchResult {
  clientMatches: {
    clientId: string;
    displayName: string;
    email: string | null;
    cases: { caseId: string; caseReference: string }[];
  }[];
  childMatches: {
    childId: string;
    fullName: string;
    dateOfBirth: string | null;
    clientId: string | null;
    clientDisplayName: string | null;
    cases: { caseId: string; caseReference: string }[];
  }[];
}

export async function findMatches(query: {
  childName?: string;
  dob?: string;
  email?: string;
}): Promise<MatchResult> {
  const db = getDb();
  const result: MatchResult = { clientMatches: [], childMatches: [] };

  if (query.email && query.email.includes('@')) {
    const rows = await db.execute(sql`
      SELECT cl.id AS client_id, cl.display_name AS display_name, cl.email AS email,
             coalesce(json_agg(json_build_object('caseId', c.id, 'caseReference', c.case_reference))
                      FILTER (WHERE c.id IS NOT NULL), '[]') AS cases
      FROM clients cl
      LEFT JOIN cases c ON c.client_id = cl.id AND c.deleted_at IS NULL
      WHERE cl.deleted_at IS NULL AND lower(cl.email) = lower(${query.email})
      GROUP BY cl.id
      LIMIT 5
    `);
    result.clientMatches = (
      rows as unknown as {
        client_id: string;
        display_name: string;
        email: string | null;
        cases: { caseId: string; caseReference: string }[];
      }[]
    ).map((r) => ({
      clientId: r.client_id,
      displayName: r.display_name,
      email: r.email,
      cases: r.cases,
    }));
  }

  if (query.childName && query.childName.trim() && query.dob) {
    const like = `%${query.childName.trim()}%`;
    const rows = await db.execute(sql`
      SELECT ch.id AS child_id, ch.full_name AS full_name, ch.date_of_birth AS dob,
             cl.id AS client_id, cl.display_name AS client_display_name,
             coalesce(json_agg(DISTINCT jsonb_build_object('caseId', c.id, 'caseReference', c.case_reference))
                      FILTER (WHERE c.id IS NOT NULL), '[]') AS cases
      FROM children ch
      LEFT JOIN client_children cc ON cc.child_id = ch.id
      LEFT JOIN clients cl ON cl.id = cc.client_id AND cl.deleted_at IS NULL
      LEFT JOIN cases c ON c.child_id = ch.id AND c.deleted_at IS NULL
      WHERE ch.deleted_at IS NULL
        AND ch.date_of_birth = ${query.dob}
        AND (ch.full_name ILIKE ${like} OR ch.preferred_name ILIKE ${like})
      GROUP BY ch.id, cl.id
      LIMIT 5
    `);
    result.childMatches = (
      rows as unknown as {
        child_id: string;
        full_name: string;
        dob: string | null;
        client_id: string | null;
        client_display_name: string | null;
        cases: { caseId: string; caseReference: string }[];
      }[]
    ).map((r) => ({
      childId: r.child_id,
      fullName: r.full_name,
      dateOfBirth: r.dob,
      clientId: r.client_id,
      clientDisplayName: r.client_display_name,
      cases: r.cases,
    }));
  }

  return result;
}

export async function getClientDetail(
  id: string,
): Promise<CaseClientDetail | null> {
  const db = getDb();
  const [c] = await db.select().from(clients).where(eq(clients.id, id));
  if (!c || c.deletedAt) return null;
  return {
    id: c.id,
    fullName: c.fullName,
    displayName: c.displayName,
    preferredName: c.preferredName,
    email: c.email,
    phone: c.phone,
    mobile: c.mobile,
    otherContact: c.otherContact,
    streetAddress: c.streetAddress,
    city: c.city,
    county: c.county,
    postcode: c.postcode,
    dsplArea: c.dsplArea,
    additionalNeeds: c.additionalNeeds,
    consentDataProcessing: c.consentDataProcessing,
    consentInformationSharing: c.consentInformationSharing,
    consentContact: c.consentContact,
    consentPrivacyNotice: c.consentPrivacyNotice,
    paymentPlanRequired: c.paymentPlanRequired,
  };
}
