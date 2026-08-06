import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import type { DocumentCategory, DocumentInfo } from '@re-send/shared';
import { getDb } from '../db/client';
import { documents, users } from '../db/schema';
import { env } from '../env';
import { recordAudit } from './audit';

const UPLOAD_ROOT = resolve(process.cwd(), env.UPLOAD_DIR);

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

export async function createDocument(
  caseId: string,
  input: {
    filename: string;
    mimeType: string;
    bytes: Buffer;
    category: DocumentCategory;
  },
  actor: string | null,
): Promise<DocumentInfo> {
  const db = getDb();
  const storageKey = `${caseId}/${randomUUID()}-${safeName(input.filename)}`;
  const path = join(UPLOAD_ROOT, storageKey);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, input.bytes);

  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const [row] = await db
    .insert(documents)
    .values({
      storageKey,
      originalFilename: input.filename,
      mimeType: input.mimeType,
      byteSize: input.bytes.byteLength,
      sha256,
      uploadedByUserId: actor ?? (await anyUserId()),
      category: input.category,
      caseId,
    })
    .returning();
  await recordAudit(db, {
    actorUserId: actor,
    action: 'document.upload',
    entityType: 'document',
    entityId: row!.id,
    after: {
      caseId,
      category: input.category,
      byteSize: input.bytes.byteLength,
    },
  });

  const uploaderName = actor
    ? ((
        await db
          .select({ n: users.displayName })
          .from(users)
          .where(eq(users.id, actor))
      )[0]?.n ?? null)
    : null;

  return {
    id: row!.id,
    originalFilename: row!.originalFilename,
    mimeType: row!.mimeType,
    byteSize: row!.byteSize,
    category: row!.category,
    uploadedByName: uploaderName,
    uploadedAt: row!.uploadedAt.toISOString(),
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

export async function getDocumentContent(
  id: string,
): Promise<DocumentContent | null> {
  const db = getDb();
  const [row] = await db.select().from(documents).where(eq(documents.id, id));
  if (!row || row.deletedAt) return null;
  try {
    const bytes = await readFile(join(UPLOAD_ROOT, row.storageKey));
    return { bytes, mimeType: row.mimeType, filename: row.originalFilename };
  } catch {
    return null;
  }
}
