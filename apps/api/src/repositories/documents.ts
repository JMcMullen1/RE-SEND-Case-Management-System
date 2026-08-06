import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type {
  DocumentCategory,
  DocumentInfo,
  DocumentUploadOutcome,
  DocumentVersionInfo,
} from '@re-send/shared';
import { getDb } from '../db/client';
import { documents, users } from '../db/schema';
import { extractText } from '../documents/extract';
import { getStorageProvider, keyFor } from '../storage';
import { recordAudit } from './audit';

export interface UploadResult {
  document: DocumentInfo;
  outcome: DocumentUploadOutcome;
}

/**
 * File a document against a case.
 *
 * - The stored object key is UUID-based and never carries the filename, so no
 *   personal data reaches storage. The filename lives only in the database.
 * - The SHA-256 of the bytes detects the same document filed twice: a
 *   byte-identical upload already on the case is returned as a `duplicate` and
 *   no second copy is stored.
 * - Same filename, different bytes creates a new version: a fresh row sharing
 *   the document group, with the previous version marked superseded. Full
 *   history is retained, nothing is overwritten.
 * - Text is extracted (PDF, DOCX, plain text) into `extracted_text` for the
 *   corpus and full-text search.
 */
export async function createDocument(
  caseId: string,
  input: {
    filename: string;
    mimeType: string;
    bytes: Buffer;
    category: DocumentCategory;
  },
  actor: string | null,
): Promise<UploadResult> {
  const db = getDb();
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');

  // Same bytes already on the case → a duplicate filing. Return the existing
  // document; do not store a second copy.
  const [dupe] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.caseId, caseId),
        eq(documents.sha256, sha256),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(desc(documents.version))
    .limit(1);
  if (dupe) {
    await recordAudit(db, {
      actorUserId: actor,
      action: 'document.duplicate',
      entityType: 'document',
      entityId: dupe.id,
      after: { caseId, category: input.category, version: dupe.version },
    });
    return {
      document: await toDocumentInfo(dupe.id),
      outcome: 'duplicate',
    };
  }

  // Same filename, different bytes → a new version of the current document.
  const [prev] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.caseId, caseId),
        eq(documents.originalFilename, input.filename),
        isNull(documents.deletedAt),
        isNull(documents.supersededById),
      ),
    )
    .limit(1);

  const uploader = actor ?? (await anyUserId());
  const storageId = randomUUID();
  const storageKey = keyFor(caseId, storageId);
  await getStorageProvider().put({
    key: storageKey,
    body: input.bytes,
    contentType: input.mimeType,
  });

  const extraction = await extractText(input.mimeType, input.bytes);
  const groupId = prev ? (prev.documentGroupId ?? prev.id) : randomUUID();
  const version = prev ? prev.version + 1 : 1;

  const inserted = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(documents)
      .values({
        storageKey,
        originalFilename: input.filename,
        mimeType: input.mimeType,
        byteSize: input.bytes.byteLength,
        sha256,
        uploadedByUserId: uploader,
        category: input.category,
        caseId,
        extractedText: extraction.text,
        documentGroupId: groupId,
        version,
      })
      .returning();
    if (prev) {
      // Point the old version at the new one and pin its group, so the chain is
      // coherent even for legacy rows filed before grouping existed.
      await tx
        .update(documents)
        .set({ supersededById: row!.id, documentGroupId: groupId })
        .where(eq(documents.id, prev.id));
    }
    return row!;
  });

  await recordAudit(db, {
    actorUserId: actor,
    action: prev ? 'document.version' : 'document.upload',
    entityType: 'document',
    entityId: inserted.id,
    after: {
      caseId,
      category: input.category,
      byteSize: input.bytes.byteLength,
      version,
      extraction: extraction.status,
    },
  });

  return {
    document: await toDocumentInfo(inserted.id),
    outcome: prev ? 'version' : 'created',
  };
}

/** The current version of every document on a case, newest upload first. */
export async function listDocuments(caseId: string): Promise<DocumentInfo[]> {
  const db = getDb();
  const group = sql`coalesce(${documents.documentGroupId}, ${documents.id})`;
  const rows = await db
    .select({
      id: documents.id,
      originalFilename: documents.originalFilename,
      mimeType: documents.mimeType,
      byteSize: documents.byteSize,
      category: documents.category,
      uploadedByName: users.displayName,
      uploadedAt: documents.uploadedAt,
      version: documents.version,
      versionCount: sql<number>`(
        SELECT count(*)::int FROM documents d2
        WHERE coalesce(d2.document_group_id, d2.id) = ${group}
          AND d2.deleted_at IS NULL
      )`,
    })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.uploadedByUserId))
    .where(
      and(
        eq(documents.caseId, caseId),
        isNull(documents.deletedAt),
        isNull(documents.supersededById),
      ),
    )
    .orderBy(desc(documents.uploadedAt));
  return rows.map((r) => ({ ...r, uploadedAt: r.uploadedAt.toISOString() }));
}

/** Full version history for the group a document belongs to, newest first. */
export async function listDocumentVersions(
  documentId: string,
): Promise<DocumentVersionInfo[]> {
  const db = getDb();
  const [target] = await db
    .select({ id: documents.id, groupId: documents.documentGroupId })
    .from(documents)
    .where(eq(documents.id, documentId));
  if (!target) return [];
  const groupId = target.groupId ?? target.id;

  const rows = await db
    .select({
      id: documents.id,
      version: documents.version,
      byteSize: documents.byteSize,
      uploadedByName: users.displayName,
      uploadedAt: documents.uploadedAt,
      supersededById: documents.supersededById,
    })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.uploadedByUserId))
    .where(
      and(
        sql`coalesce(${documents.documentGroupId}, ${documents.id}) = ${groupId}`,
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(desc(documents.version));
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    byteSize: r.byteSize,
    uploadedByName: r.uploadedByName,
    uploadedAt: r.uploadedAt.toISOString(),
    isCurrent: r.supersededById === null,
  }));
}

async function toDocumentInfo(id: string): Promise<DocumentInfo> {
  const db = getDb();
  const [row] = await db
    .select({
      id: documents.id,
      originalFilename: documents.originalFilename,
      mimeType: documents.mimeType,
      byteSize: documents.byteSize,
      category: documents.category,
      uploadedByName: users.displayName,
      uploadedAt: documents.uploadedAt,
      version: documents.version,
      group: sql<string>`coalesce(${documents.documentGroupId}, ${documents.id})`,
    })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.uploadedByUserId))
    .where(eq(documents.id, id));
  const counts = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(documents)
    .where(
      and(
        sql`coalesce(${documents.documentGroupId}, ${documents.id}) = ${row!.group}`,
        isNull(documents.deletedAt),
      ),
    );
  const { group: _group, uploadedAt, ...rest } = row!;
  return {
    ...rest,
    uploadedAt: uploadedAt.toISOString(),
    versionCount: counts[0]?.n ?? 1,
  };
}

async function anyUserId(): Promise<string> {
  const db = getDb();
  const [row] = await db.select({ id: users.id }).from(users).limit(1);
  if (!row) throw new Error('No users to attribute upload to');
  return row.id;
}

export interface DocumentContent {
  bytes: Buffer;
  mimeType: string;
  filename: string;
}

/**
 * Read a document's bytes through the storage provider. Every read is recorded
 * in the audit log — downloads and previews alike go through here, so storage
 * URLs never reach the browser.
 */
export async function getDocumentContent(
  id: string,
  actor: string | null,
): Promise<DocumentContent | null> {
  const db = getDb();
  const [row] = await db.select().from(documents).where(eq(documents.id, id));
  if (!row || row.deletedAt) return null;
  const object = await getStorageProvider().get(row.storageKey);
  if (!object) return null;
  await recordAudit(db, {
    actorUserId: actor,
    action: 'document.access',
    entityType: 'document',
    entityId: row.id,
    after: { caseId: row.caseId, version: row.version },
  });
  return {
    bytes: object.body,
    mimeType: row.mimeType,
    filename: row.originalFilename,
  };
}
