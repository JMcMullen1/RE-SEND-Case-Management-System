import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
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

  const existing = await findByDedupKey(caseId, parsed.dedupKey);
  if (existing) {
    await recordAudit(db, {
      actorUserId: actor,
      action: 'email.duplicate',
      entityType: 'email',
      entityId: existing,
      after: { caseId },
    });
    return { email: (await getEmail(existing))!, outcome: 'duplicate' };
  }

  const rawDocumentId = await storeEmailSource(caseId, input, actor);
  let id: string;
  try {
    id = await insertEmail(caseId, parsed, rawDocumentId, actor);
  } catch (err) {
    // The original file is only hidden while an email points at it. If the
    // email was not recorded, discard it (soft, audited) so it never surfaces
    // in the documents list as a stray file.
    await deleteDocuments(caseId, [rawDocumentId], actor);
    // Two people filed the same email at the same moment: the unique index
    // caught the second. Report it as the duplicate it is.
    const raced = await findByDedupKey(caseId, parsed.dedupKey);
    if (raced) return { email: (await getEmail(raced))!, outcome: 'duplicate' };
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
      rawDocumentId,
      attachmentDocumentIds: email.attachments.map((a) => a.documentId),
    },
  });

  return { email, outcome: 'created' };
}

/**
 * File the attachments as case documents, work out the direction, and record
 * the email. Attachments already filed stay filed if a later step fails — they
 * are legitimate case documents in their own right.
 */
async function insertEmail(
  caseId: string,
  parsed: ParsedEmail,
  rawDocumentId: string,
  actor: string | null,
): Promise<string> {
  const db = getDb();
  const attachmentIds: string[] = [];
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
    );
    if (!attachmentIds.includes(res.document.id)) {
      attachmentIds.push(res.document.id);
    }
  }

  const staff = await db.select({ email: users.email }).from(users);
  const direction = inferEmailDirection(
    parsed.fromAddress,
    staff.map((s) => s.email),
  );

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
      rawDocumentId,
      attachmentDocumentIds: attachmentIds,
      filedByUserId: actor,
    })
    .returning({ id: emails.id });
  return row!.id;
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
 * file stays in storage so an administrator can recover it, and attachments —
 * already case documents in their own right — are left in place. Only an email
 * on the named case is touched. Returns false when there was nothing to delete.
 */
export async function deleteEmail(
  caseId: string,
  emailId: string,
  actor: string | null,
): Promise<boolean> {
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
    .returning({ id: emails.id });
  if (removed.length === 0) return false;
  await recordAudit(db, {
    actorUserId: actor,
    action: 'email.delete',
    entityType: 'email',
    entityId: emailId,
    before: { caseId },
  });
  return true;
}
