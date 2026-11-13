import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  sql,
  type SQL,
} from 'drizzle-orm';
import {
  EMAIL_ATTACHMENT_FOLDER,
  inferEmailDirection,
  type EmailAttachmentInfo,
  type EmailFileResult,
  type EmailInfo,
} from '@re-send/shared';
import { getDb } from '../db/client';
import { cases, documents, emails, users } from '../db/schema';
import { parseEmailFile, type ParsedEmail } from '../email/parse';
import { recordAudit } from './audit';
import { createDocument, deleteDocuments, storeEmailSource } from './documents';

export class CaseNotFoundError extends Error {}

/**
 * File an email (.eml or Outlook .msg) against a case.
 *
 * - The same email already on the case — by Message-ID, so an .eml and a .msg
 *   export of one message match, whoever filed it — is reported as a
 *   `duplicate` and nothing new is stored.
 * - The original file is kept (hidden from the documents list) so it can be
 *   downloaded exactly as received; every attachment is filed as a case
 *   document in its own right, with the usual duplicate and version handling.
 * - Direction is inferred: sent from a staff address (or the charity's own
 *   domain) is outbound, anything else inbound.
 * - One audit entry records the filing, carrying identifiers only.
 *
 * Throws `EmailParseError` when the file is not a readable email and
 * `CaseNotFoundError` when the case does not exist.
 */
export async function fileEmail(
  caseId: string,
  input: { filename: string; mimeType: string; bytes: Buffer },
  actor: string | null,
): Promise<EmailFileResult> {
  const db = getDb();
  const [target] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, caseId), isNull(cases.deletedAt)));
  if (!target) throw new CaseNotFoundError('Case not found');

  const parsed = await parseEmailFile(input.filename, input.bytes);

  // Claim the email first: the unique (case, dedup key) index makes the
  // insert the arbiter, so of two simultaneous filings exactly one proceeds and
  // the other stores nothing at all — no second original, no second set of
  // attachments.
  const id = await claimEmail(caseId, parsed, actor);
  if (!id) {
    const existing = (await findByDedupKey(caseId, parsed.dedupKey))!;
    await recordAudit(db, {
      actorUserId: actor,
      action: 'email.duplicate',
      entityType: 'email',
      entityId: existing,
      after: { caseId },
    });
    return { email: (await getEmail(existing))!, outcome: 'duplicate' };
  }

  let rawDocumentId: string | null = null;
  try {
    rawDocumentId = await storeEmailSource(caseId, input, actor);
    const attachmentIds = await fileAttachments(caseId, parsed, actor);
    await db
      .update(emails)
      .set({ rawDocumentId, attachmentDocumentIds: attachmentIds })
      .where(eq(emails.id, id));
  } catch (err) {
    // Release the claim so the email can be filed again, and discard the
    // original file — it is only hidden while an email points at it.
    // Attachments already filed stay: they are case documents in their own
    // right.
    await db
      .update(emails)
      .set({ deletedAt: new Date() })
      .where(eq(emails.id, id));
    if (rawDocumentId) await deleteDocuments(caseId, [rawDocumentId], actor);
    throw err;
  }

  const email = (await getEmail(id))!;
  await recordAudit(db, {
    actorUserId: actor,
    action: 'email.file',
    entityType: 'email',
    entityId: id,
    after: {
      caseId,
      direction: email.direction,
      rawDocumentId: email.rawDocumentId,
      attachmentDocumentIds: email.attachments.map((a) => a.documentId),
    },
  });

  return { email, outcome: 'created' };
}

/**
 * Record the email (without its files yet). Returns null when the same email
 * is already on the case — including one being filed at this very moment.
 */
async function claimEmail(
  caseId: string,
  parsed: ParsedEmail,
  actor: string | null,
): Promise<string | null> {
  const db = getDb();
  const staff = await db.select({ email: users.email }).from(users);
  const direction = inferEmailDirection(
    parsed.fromAddress,
    staff.map((s) => s.email),
  );
  try {
    const [row] = await db
      .insert(emails)
      .values({
        internetMessageId: parsed.messageId,
        dedupKey: parsed.dedupKey,
        subject: parsed.subject,
        fromName: parsed.fromName,
        fromAddress: parsed.fromAddress,
        toAddresses: parsed.toAddresses,
        ccAddresses: parsed.ccAddresses,
        sentAt: parsed.sentAt,
        receivedAt: direction === 'inbound' ? parsed.sentAt : null,
        bodyText: parsed.bodyText,
        bodyHtml: parsed.bodyHtml,
        direction,
        caseId,
        filedByUserId: actor,
      })
      .returning({ id: emails.id });
    return row!.id;
  } catch (err) {
    if ((err as { code?: string }).code === UNIQUE_VIOLATION) return null;
    throw err;
  }
}

const UNIQUE_VIOLATION = '23505';

/**
 * File each attachment as a case document. A byte-identical file already on
 * the case is linked rather than stored again; a same-named but different file
 * is a separate document, never a "new version" of an unrelated one.
 */
async function fileAttachments(
  caseId: string,
  parsed: ParsedEmail,
  actor: string | null,
): Promise<string[]> {
  const ids: string[] = [];
  for (const att of parsed.attachments) {
    const res = await createDocument(
      caseId,
      {
        filename: att.filename,
        mimeType: att.mimeType,
        bytes: att.bytes,
        category: EMAIL_ATTACHMENT_FOLDER,
      },
      actor,
      { versioning: false },
    );
    if (!ids.includes(res.document.id)) ids.push(res.document.id);
  }
  return ids;
}

async function findByDedupKey(
  caseId: string,
  dedupKey: string,
): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: emails.id })
    .from(emails)
    .where(
      and(
        eq(emails.caseId, caseId),
        eq(emails.dedupKey, dedupKey),
        isNull(emails.deletedAt),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

const emailColumns = {
  id: emails.id,
  subject: emails.subject,
  fromName: emails.fromName,
  fromAddress: emails.fromAddress,
  toAddresses: emails.toAddresses,
  ccAddresses: emails.ccAddresses,
  sentAt: emails.sentAt,
  direction: emails.direction,
  bodyText: emails.bodyText,
  attachmentDocumentIds: emails.attachmentDocumentIds,
  filedByName: users.displayName,
  filedAt: emails.createdAt,
  rawDocumentId: emails.rawDocumentId,
};

/** Live emails matching `where`, most recently sent first. */
function selectEmails(where: SQL) {
  return getDb()
    .select(emailColumns)
    .from(emails)
    .leftJoin(users, eq(users.id, emails.filedByUserId))
    .where(and(where, isNull(emails.deletedAt)))
    .orderBy(
      sql`coalesce(${emails.sentAt}, ${emails.createdAt}) DESC`,
      desc(emails.createdAt),
    );
}

type EmailRow = Awaited<ReturnType<typeof selectEmails>>[number];

/** Every live email filed on a case, most recently sent first. */
export async function listEmails(caseId: string): Promise<EmailInfo[]> {
  return toInfos(await selectEmails(eq(emails.caseId, caseId)));
}

/** One live email by id, or null. */
export async function getEmail(id: string): Promise<EmailInfo | null> {
  const [info] = await toInfos(await selectEmails(eq(emails.id, id)));
  return info ?? null;
}

async function toInfos(rows: EmailRow[]): Promise<EmailInfo[]> {
  const ids = [...new Set(rows.flatMap((r) => r.attachmentDocumentIds ?? []))];
  const docs = ids.length
    ? await getDb()
        .select({
          documentId: documents.id,
          originalFilename: documents.originalFilename,
          mimeType: documents.mimeType,
          byteSize: documents.byteSize,
          category: documents.category,
        })
        .from(documents)
        .where(and(inArray(documents.id, ids), isNull(documents.deletedAt)))
    : [];
  const byId = new Map<string, EmailAttachmentInfo>(
    docs.map((d) => [d.documentId, d]),
  );
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    fromName: r.fromName,
    fromAddress: r.fromAddress,
    toAddresses: r.toAddresses ?? [],
    ccAddresses: r.ccAddresses ?? [],
    sentAt: r.sentAt?.toISOString() ?? null,
    direction: r.direction,
    bodyText: r.bodyText,
    attachments: (r.attachmentDocumentIds ?? [])
      .map((id) => byId.get(id))
      .filter((d): d is EmailAttachmentInfo => d !== undefined),
    filedByName: r.filedByName,
    filedAt: r.filedAt.toISOString(),
    rawDocumentId: r.rawDocumentId,
  }));
}

/**
 * Remove an email filed in error. The delete is soft and audited; the original
 * file stays in storage so an administrator can recover it. Only an email on
 * the named case is touched. Returns null when there was nothing to delete.
 *
 * With `withAttachments` (an email filed on the wrong case), the attachments
 * this filing added go too — soft and audited like any document delete. A file
 * that was already on the case before the email arrived, or that another email
 * on the case also carries, is left alone.
 */
export async function deleteEmail(
  caseId: string,
  emailId: string,
  actor: string | null,
  options: { withAttachments?: boolean } = {},
): Promise<{ attachmentsDeleted: number } | null> {
  const db = getDb();
  const removed = await db
    .update(emails)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(emails.id, emailId),
        eq(emails.caseId, caseId),
        isNull(emails.deletedAt),
      ),
    )
    .returning({
      rawDocumentId: emails.rawDocumentId,
      attachmentIds: emails.attachmentDocumentIds,
    });
  const [row] = removed;
  if (!row) return null;
  await recordAudit(db, {
    actorUserId: actor,
    action: 'email.delete',
    entityType: 'email',
    entityId: emailId,
    before: { caseId },
    after: { withAttachments: Boolean(options.withAttachments) },
  });

  if (
    !options.withAttachments ||
    row.attachmentIds.length === 0 ||
    !row.rawDocumentId
  ) {
    return { attachmentsDeleted: 0 };
  }
  // Attachments this filing stored were uploaded after its original file; a
  // byte-identical file already on the case was linked, not stored, so it is
  // older and excluded here.
  const [raw] = await db
    .select({ at: documents.uploadedAt })
    .from(documents)
    .where(eq(documents.id, row.rawDocumentId));
  if (!raw) return { attachmentsDeleted: 0 };
  const own = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        inArray(documents.id, row.attachmentIds),
        gte(documents.uploadedAt, raw.at),
        sql`NOT EXISTS (
          SELECT 1 FROM ${emails} e
          WHERE e.case_id = ${caseId} AND e.deleted_at IS NULL
            AND ${documents.id} = ANY(e.attachment_document_ids)
        )`,
      ),
    );
  if (own.length === 0) return { attachmentsDeleted: 0 };
  const { deleted } = await deleteDocuments(
    caseId,
    own.map((r) => r.id),
    actor,
  );
  return { attachmentsDeleted: deleted };
}

/** Live and deleted emails on a case, oldest first, for the case corpus. */
export async function emailsForCorpus(caseId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: emails.id,
      subject: emails.subject,
      fromName: emails.fromName,
      fromAddress: emails.fromAddress,
      toAddresses: emails.toAddresses,
      ccAddresses: emails.ccAddresses,
      sentAt: emails.sentAt,
      createdAt: emails.createdAt,
      direction: emails.direction,
      bodyText: emails.bodyText,
      attachmentDocumentIds: emails.attachmentDocumentIds,
      rawDocumentId: emails.rawDocumentId,
      deletedAt: emails.deletedAt,
    })
    .from(emails)
    .where(eq(emails.caseId, caseId))
    .orderBy(asc(emails.sentAt));
  const ids = [...new Set(rows.flatMap((r) => r.attachmentDocumentIds))];
  const names = new Map<string, string>();
  if (ids.length) {
    const docs = await db
      .select({ id: documents.id, name: documents.originalFilename })
      .from(documents)
      .where(inArray(documents.id, ids));
    for (const d of docs) names.set(d.id, d.name);
  }
  return rows.map((r) => ({
    ...r,
    attachmentNames: r.attachmentDocumentIds
      .map((id) => names.get(id))
      .filter((n): n is string => n !== undefined),
  }));
}
