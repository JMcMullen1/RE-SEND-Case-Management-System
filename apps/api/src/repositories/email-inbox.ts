import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  EMAIL_INBOX_CLAIM_MINUTES,
  EMAIL_NO_AUTO_FILE_STATUSES,
  emailAddressesIn,
  matchEmailToCases,
  nameForms,
  type EmailCaseSuggestion,
  type EmailInboxItem,
  type EmailIntakeResult,
  type EmailMatchReason,
  type MatchableCase,
  type Status,
} from '@re-send/shared';
import { getDb } from '../db/client';
import {
  cases,
  clients,
  children,
  emailInbox,
  emails,
  users,
} from '../db/schema';
import { currentFileKeyId } from '../crypto/encryption';
import { parseEmailFile } from '../email/parse';
import { getStorageProvider } from '../storage';
import { recordAudit } from './audit';
import { fileEmail } from './emails';

export class InboxItemNotFound extends Error {}
export class InboxItemResolved extends Error {}

interface MatchRow {
  id: string;
  case_reference: string;
  appeal_number: string | null;
  status: Status;
  client_name: string | null;
  client_email: string | null;
  child_name: string | null;
  child_preferred: string | null;
  la_contacts: string[] | null;
  other_client_names: string[] | null;
  other_client_emails: string[] | null;
  school_contact_emails: string[] | null;
}

/**
 * Every live case as matching sees it: reference, appeal number, the client's
 * (and any other parent's on the child) name and email, the child's names, and
 * the email addresses of the school and LA contacts on the case.
 */
async function matchableCases(): Promise<MatchableCase[]> {
  const rows = (await getDb().execute(sql`
    SELECT c.id, c.case_reference, c.appeal_number, c.status,
           cl.full_name AS client_name, cl.email AS client_email,
           ch.full_name AS child_name, ch.preferred_name AS child_preferred,
           ch.la_contacts,
           (SELECT array_agg(DISTINCT o.full_name)
              FROM client_children cc
              JOIN clients o ON o.id = cc.client_id AND o.deleted_at IS NULL
             WHERE cc.child_id = c.child_id) AS other_client_names,
           (SELECT array_agg(DISTINCT o.email)
              FROM client_children cc
              JOIN clients o ON o.id = cc.client_id AND o.deleted_at IS NULL
             WHERE cc.child_id = c.child_id AND o.email IS NOT NULL) AS other_client_emails,
           (SELECT array_agg(DISTINCT sc.email)
              FROM case_schools l
              JOIN school_contacts sc ON sc.id = ANY(l.contact_ids)
                   AND sc.deleted_at IS NULL AND sc.email IS NOT NULL
             WHERE l.case_id = c.id AND l.deleted_at IS NULL) AS school_contact_emails
      FROM cases c
      LEFT JOIN clients cl ON cl.id = c.client_id AND cl.deleted_at IS NULL
      LEFT JOIN children ch ON ch.id = c.child_id AND ch.deleted_at IS NULL
     WHERE c.deleted_at IS NULL
  `)) as unknown as MatchRow[];

  const noAuto = EMAIL_NO_AUTO_FILE_STATUSES as readonly string[];
  return rows.map((r) => {
    const childForms = nameForms(r.child_name);
    // "Pia Pemberton" for Piadora Pemberton, known as Pia.
    const surname = (r.child_name ?? '').trim().split(/\s+/).at(-1);
    if (r.child_preferred && surname)
      childForms.push(...nameForms(`${r.child_preferred} ${surname}`));
    return {
      caseId: r.id,
      caseReference: r.case_reference,
      appealNumber: r.appeal_number,
      noAutoFile: noAuto.includes(r.status),
      clientEmails: [r.client_email, ...(r.other_client_emails ?? [])].filter(
        (e): e is string => Boolean(e),
      ),
      clientNames: [r.client_name, ...(r.other_client_names ?? [])].flatMap(
        (n) => nameForms(n),
      ),
      childNames: childForms,
      schoolContactEmails: r.school_contact_emails ?? [],
      laContactEmails: (r.la_contacts ?? []).flatMap((l) =>
        emailAddressesIn(l),
      ),
    };
  });
}

async function staffAddresses(): Promise<string[]> {
  const rows = await getDb().select({ email: users.email }).from(users);
  return rows.map((r) => r.email);
}

async function caseReferenceOf(caseId: string): Promise<string> {
  const [row] = await getDb()
    .select({ ref: cases.caseReference })
    .from(cases)
    .where(eq(cases.id, caseId));
  return row?.ref ?? '';
}

/**
 * Take in one email to be filed. Already on a case: reported, nothing stored.
 * Matched to one open case with confidence: filed there by the normal email
 * path. Anything else: kept (encrypted) in the list of emails to file, with
 * the likely cases suggested. Every outcome is audited by identifier.
 */
export async function intakeEmail(
  input: { filename: string; mimeType: string; bytes: Buffer },
  actor: string | null,
): Promise<EmailIntakeResult> {
  const db = getDb();
  const parsed = await parseEmailFile(input.filename, input.bytes);

  // The same email already filed on a case.
  const filed = await alreadyFiled(parsed.dedupKey);
  if (filed)
    return {
      outcome: 'duplicate',
      emailId: filed.emailId,
      caseId: filed.caseId,
      caseReference: await caseReferenceOf(filed.caseId),
      reasons: [],
    };

  // Already waiting in the list.
  const [waiting] = await db
    .select({ id: emailInbox.id })
    .from(emailInbox)
    .where(
      and(
        eq(emailInbox.dedupKey, parsed.dedupKey),
        eq(emailInbox.status, 'waiting'),
      ),
    );
  if (waiting) return { outcome: 'already_waiting', itemId: waiting.id };

  const match = matchEmailToCases(
    parsed,
    await matchableCases(),
    await staffAddresses(),
  );

  if (match.autoFileCaseId) {
    const caseId = match.autoFileCaseId;
    const reasons = match.matches[0]!.reasons;
    const result = await fileEmail(caseId, input, actor);
    // Filed by matching (fileEmail audits a duplicate itself).
    if (result.outcome === 'created')
      await recordAudit(db, {
        actorUserId: actor,
        action: 'email.auto_file',
        entityType: 'email',
        entityId: result.email.id,
        after: { caseId, reasons, score: match.matches[0]!.score },
      });
    return {
      outcome: result.outcome === 'created' ? 'filed' : 'duplicate',
      emailId: result.email.id,
      caseId,
      caseReference: await caseReferenceOf(caseId),
      reasons,
    };
  }

  const storageKey = `inbox/${randomUUID()}`;
  await getStorageProvider().put({
    key: storageKey,
    body: input.bytes,
    contentType: input.mimeType,
  });
  let id: string;
  try {
    const [row] = await db
      .insert(emailInbox)
      .values({
        storageKey,
        originalFilename: input.filename,
        mimeType: input.mimeType,
        byteSize: input.bytes.byteLength,
        dedupKey: parsed.dedupKey,
        subject: parsed.subject,
        fromName: parsed.fromName,
        fromAddress: parsed.fromAddress,
        sentAt: parsed.sentAt,
        suggestions: match.matches,
        addedByUserId: actor,
        encryptionKeyId: currentFileKeyId(),
      })
      .returning({ id: emailInbox.id });
    id = row!.id;
  } catch (err) {
    await getStorageProvider().delete(storageKey);
    // The same email added at this very moment by someone else.
    if ((err as { code?: string }).code === '23505') {
      const [again] = await db
        .select({ id: emailInbox.id })
        .from(emailInbox)
        .where(
          and(
            eq(emailInbox.dedupKey, parsed.dedupKey),
            eq(emailInbox.status, 'waiting'),
          ),
        );
      if (again) return { outcome: 'already_waiting', itemId: again.id };
    }
    throw err;
  }
  await recordAudit(db, {
    actorUserId: actor,
    action: 'email_inbox.add',
    entityType: 'email_inbox',
    entityId: id,
    after: {
      suggestedCaseIds: match.matches.map((m) => m.caseId),
      topScore: match.matches[0]?.score ?? 0,
    },
  });
  const [item] = await listInbox(id);
  return { outcome: 'queued', item: item! };
}

/** The emails waiting to be filed, newest first (or just one). */
export async function listInbox(onlyId?: string): Promise<EmailInboxItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: emailInbox.id,
      filename: emailInbox.originalFilename,
      subject: emailInbox.subject,
      fromName: emailInbox.fromName,
      fromAddress: emailInbox.fromAddress,
      sentAt: emailInbox.sentAt,
      addedAt: emailInbox.createdAt,
      addedByName: users.displayName,
      suggestions: emailInbox.suggestions,
    })
    .from(emailInbox)
    .leftJoin(users, eq(users.id, emailInbox.addedByUserId))
    .where(
      onlyId ? eq(emailInbox.id, onlyId) : eq(emailInbox.status, 'waiting'),
    )
    .orderBy(desc(emailInbox.createdAt));

  const caseIds = [
    ...new Set(rows.flatMap((r) => r.suggestions.map((s) => s.caseId))),
  ];
  const caseRows = caseIds.length
    ? await db
        .select({
          id: cases.id,
          ref: cases.caseReference,
          status: cases.status,
          clientName: clients.displayName,
          childName: children.fullName,
          childPreferred: children.preferredName,
        })
        .from(cases)
        .leftJoin(clients, eq(clients.id, cases.clientId))
        .leftJoin(children, eq(children.id, cases.childId))
        .where(and(inArray(cases.id, caseIds), isNull(cases.deletedAt)))
    : [];
  const byId = new Map(caseRows.map((c) => [c.id, c]));
  const noAuto = EMAIL_NO_AUTO_FILE_STATUSES as readonly string[];

  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    subject: r.subject,
    fromName: r.fromName,
    fromAddress: r.fromAddress,
    sentAt: r.sentAt?.toISOString() ?? null,
    addedAt: r.addedAt.toISOString(),
    addedByName: r.addedByName ?? null,
    // A case deleted since is no longer suggested.
    suggestions: r.suggestions.flatMap((s): EmailCaseSuggestion[] => {
      const c = byId.get(s.caseId);
      if (!c) return [];
      return [
        {
          caseId: s.caseId,
          caseReference: c.ref,
          clientName: c.clientName,
          childName: c.childPreferred ?? c.childName,
          closed: noAuto.includes(c.status),
          score: s.score,
          reasons: s.reasons as EmailMatchReason[],
        },
      ];
    }),
  }));
}

async function waitingItem(id: string) {
  const [item] = await getDb()
    .select()
    .from(emailInbox)
    .where(eq(emailInbox.id, id));
  if (!item) throw new InboxItemNotFound('Not found');
  if (item.status !== 'waiting')
    throw new InboxItemResolved('This email has already been dealt with.');
  return item;
}

/** The text of an email waiting to be filed, to help decide its case. */
export async function inboxEmailText(id: string): Promise<{
  bodyText: string;
  toAddresses: string[];
  ccAddresses: string[];
  attachmentNames: string[];
}> {
  const item = await waitingItem(id);
  const stored = await getStorageProvider().get(item.storageKey);
  if (!stored) throw new InboxItemNotFound('The email file is missing.');
  const parsed = await parseEmailFile(item.originalFilename, stored.body);
  return {
    bodyText: parsed.bodyText ?? '',
    toAddresses: parsed.toAddresses,
    ccAddresses: parsed.ccAddresses,
    attachmentNames: parsed.attachments.map((a) => a.filename),
  };
}

/** Delete a stored file that is no longer needed; a failure leaves it behind. */
async function deleteStored(key: string): Promise<void> {
  try {
    await getStorageProvider().delete(key);
  } catch {
    // Left in storage (encrypted); the email itself is already dealt with.
  }
}

/** Where an email is already filed, on any live case, or null. */
async function alreadyFiled(
  dedupKey: string,
): Promise<{ emailId: string; caseId: string } | null> {
  const [row] = await getDb()
    .select({ emailId: emails.id, caseId: emails.caseId })
    .from(emails)
    .innerJoin(cases, and(eq(cases.id, emails.caseId), isNull(cases.deletedAt)))
    .where(and(eq(emails.dedupKey, dedupKey), isNull(emails.deletedAt)))
    .orderBy(emails.createdAt)
    .limit(1);
  return row?.caseId ? { emailId: row.emailId, caseId: row.caseId } : null;
}

/**
 * File an email from the list to the case chosen, by the normal email path
 * (duplicates, attachments and audit as ever), then take it off the list.
 * If the same email has meanwhile been filed on a case by another route, it
 * is not filed a second time: the list entry is closed against that case.
 */
export async function fileInboxItem(
  id: string,
  caseId: string,
  actor: string | null,
): Promise<EmailIntakeResult> {
  const db = getDb();
  // Claim it: two people filing it at once cannot put it on two cases. It
  // stays waiting while filing runs, so the same email cannot be added again.
  const [item] = await db
    .update(emailInbox)
    .set({ filingStartedAt: new Date() })
    .where(
      and(
        eq(emailInbox.id, id),
        eq(emailInbox.status, 'waiting'),
        sql`(${emailInbox.filingStartedAt} IS NULL OR ${emailInbox.filingStartedAt} < now() - make_interval(mins => ${EMAIL_INBOX_CLAIM_MINUTES}))`,
      ),
    )
    .returning();
  if (!item) {
    await waitingItem(id); // not found, or dealt with
    throw new InboxItemResolved('Someone else is filing this email now.');
  }
  const release = () =>
    db
      .update(emailInbox)
      .set({ filingStartedAt: null })
      .where(eq(emailInbox.id, id));

  let result: { emailId: string; caseId: string; created: boolean };
  try {
    const elsewhere = await alreadyFiled(item.dedupKey);
    if (elsewhere) {
      result = { ...elsewhere, created: false };
    } else {
      const stored = await getStorageProvider().get(item.storageKey);
      if (!stored) throw new InboxItemNotFound('The email file is missing.');
      const filed = await fileEmail(
        caseId,
        {
          filename: item.originalFilename,
          mimeType: item.mimeType,
          bytes: stored.body,
        },
        actor,
      );
      result = {
        emailId: filed.email.id,
        caseId,
        created: filed.outcome === 'created',
      };
    }
  } catch (err) {
    await release();
    throw err;
  }

  await db
    .update(emailInbox)
    .set({
      status: 'filed',
      filingStartedAt: null,
      resolvedByUserId: actor,
      resolvedAt: new Date(),
      filedCaseId: result.caseId,
      filedEmailId: result.emailId,
    })
    .where(eq(emailInbox.id, id));
  const suggestion = item.suggestions.find((s) => s.caseId === result.caseId);
  await recordAudit(db, {
    actorUserId: actor,
    action: 'email_inbox.file',
    entityType: 'email_inbox',
    entityId: id,
    after: {
      caseId: result.caseId,
      emailId: result.emailId,
      suggested: Boolean(suggestion),
      alreadyFiled: !result.created,
    },
  });
  await deleteStored(item.storageKey);
  return {
    outcome: result.created ? 'filed' : 'duplicate',
    emailId: result.emailId,
    caseId: result.caseId,
    caseReference: await caseReferenceOf(result.caseId),
    reasons: (suggestion?.reasons ?? []) as EmailMatchReason[],
  };
}

/** Take an email off the list without filing it (it belongs to no case). */
export async function dismissInboxItem(
  id: string,
  actor: string | null,
): Promise<void> {
  const db = getDb();
  const [done] = await db
    .update(emailInbox)
    .set({
      status: 'dismissed',
      resolvedByUserId: actor,
      resolvedAt: new Date(),
    })
    .where(
      and(
        eq(emailInbox.id, id),
        eq(emailInbox.status, 'waiting'),
        sql`(${emailInbox.filingStartedAt} IS NULL OR ${emailInbox.filingStartedAt} < now() - make_interval(mins => ${EMAIL_INBOX_CLAIM_MINUTES}))`,
      ),
    )
    .returning({ storageKey: emailInbox.storageKey });
  if (!done) {
    await waitingItem(id);
    throw new InboxItemResolved('Someone else is filing this email now.');
  }
  await recordAudit(db, {
    actorUserId: actor,
    action: 'email_inbox.dismiss',
    entityType: 'email_inbox',
    entityId: id,
  });
  await deleteStored(done.storageKey);
}

/** How many emails are waiting to be filed (for the navigation). */
export async function inboxCount(): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(emailInbox)
    .where(eq(emailInbox.status, 'waiting'));
  return row?.n ?? 0;
}
