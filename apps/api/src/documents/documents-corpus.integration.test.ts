import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import {
  createDocument,
  deleteDocuments,
  listDocumentVersions,
  listDocuments,
} from '../repositories/documents';
import { caseCorpus } from '../corpus/case-corpus';
import { invalidateCorpus } from '../corpus/cache';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

async function anyCaseAndUser() {
  const db = getDb();
  const [c] = (await db.execute(
    sql`SELECT id FROM cases WHERE deleted_at IS NULL LIMIT 1`,
  )) as unknown as { id: string }[];
  const [u] = (await db.execute(
    sql`SELECT id FROM users LIMIT 1`,
  )) as unknown as { id: string }[];
  return { caseId: c!.id, userId: u!.id };
}

run('documents: dedup + versioning', () => {
  let caseId = '';
  let userId = '';
  const name = `plan-${Date.now()}.txt`;

  beforeAll(async () => {
    ({ caseId, userId } = await anyCaseAndUser());
  });

  it('files a new document, detects a duplicate, and versions a change', async () => {
    const first = await createDocument(
      caseId,
      {
        filename: name,
        mimeType: 'text/plain',
        bytes: Buffer.from('Original plan text', 'utf8'),
        category: 'Working Document',
      },
      userId,
    );
    expect(first.outcome).toBe('created');
    expect(first.document.version).toBe(1);

    // Same bytes again → duplicate, no new copy.
    const dupe = await createDocument(
      caseId,
      {
        filename: name,
        mimeType: 'text/plain',
        bytes: Buffer.from('Original plan text', 'utf8'),
        category: 'Working Document',
      },
      userId,
    );
    expect(dupe.outcome).toBe('duplicate');
    expect(dupe.document.id).toBe(first.document.id);

    // Same filename, new bytes → new version; the old one is superseded.
    const second = await createDocument(
      caseId,
      {
        filename: name,
        mimeType: 'text/plain',
        bytes: Buffer.from('Revised plan text', 'utf8'),
        category: 'Working Document',
      },
      userId,
    );
    expect(second.outcome).toBe('version');
    expect(second.document.version).toBe(2);
    expect(second.document.versionCount).toBe(2);

    // The list shows only the current version.
    const listed = await listDocuments(caseId);
    const current = listed.filter((d) => d.originalFilename === name);
    expect(current).toHaveLength(1);
    expect(current[0]!.id).toBe(second.document.id);

    // History shows both versions, exactly one current.
    const versions = await listDocumentVersions(second.document.id);
    expect(versions).toHaveLength(2);
    expect(versions.filter((v) => v.isCurrent)).toHaveLength(1);
  });

  it('soft-deletes a document and every version, scoped to the case', async () => {
    const filename = `to-delete-${Date.now()}.txt`;
    // Two versions → one logical document, a version chain of two rows.
    await createDocument(
      caseId,
      {
        filename,
        mimeType: 'text/plain',
        bytes: Buffer.from('v1', 'utf8'),
        category: 'Working Document',
      },
      userId,
    );
    const v2 = await createDocument(
      caseId,
      {
        filename,
        mimeType: 'text/plain',
        bytes: Buffer.from('v2', 'utf8'),
        category: 'Working Document',
      },
      userId,
    );

    // Deleting by the current-version id removes both rows in the group.
    const result = await deleteDocuments(caseId, [v2.document.id], userId);
    expect(result.deleted).toBe(2);

    // It disappears from the list and its history is gone.
    const listed = await listDocuments(caseId);
    expect(listed.some((d) => d.originalFilename === filename)).toBe(false);
    expect(await listDocumentVersions(v2.document.id)).toHaveLength(0);

    // An id belonging to another case cannot be deleted through this case.
    const otherCaseDelete = await deleteDocuments(
      '00000000-0000-0000-0000-000000000000',
      [v2.document.id],
      userId,
    );
    expect(otherCaseDelete.deleted).toBe(0);
  });
});

run('case corpus', () => {
  let caseId = '';
  let userId = '';

  beforeAll(async () => {
    ({ caseId, userId } = await anyCaseAndUser());
  });

  it('assembles items, excludes superseded versions visibly, counts tokens', async () => {
    const name = `evidence-${Date.now()}.txt`;
    const v1 = await createDocument(
      caseId,
      {
        filename: name,
        mimeType: 'text/plain',
        bytes: Buffer.from('Evidence version one', 'utf8'),
        category: 'Evidence',
      },
      userId,
    );
    const v2 = await createDocument(
      caseId,
      {
        filename: name,
        mimeType: 'text/plain',
        bytes: Buffer.from('Evidence version two', 'utf8'),
        category: 'Evidence',
      },
      userId,
    );
    invalidateCorpus(caseId);

    const corpus = await caseCorpus(caseId);

    // The current version is an item; the superseded one is excluded, named.
    const docItem = corpus.items.find((i) => i.id === v2.document.id);
    expect(docItem?.type).toBe('document');
    expect(docItem?.text).toContain('Evidence version two');
    expect(corpus.items.some((i) => i.id === v1.document.id)).toBe(false);
    expect(
      corpus.excluded.some(
        (e) => e.id === v1.document.id && e.reason === 'superseded',
      ),
    ).toBe(true);

    // A case_record item exists and the serialisation carries item ids.
    expect(corpus.items.some((i) => i.type === 'case_record')).toBe(true);
    expect(corpus.serialised).toContain(`id=${v2.document.id}`);
    expect(corpus.tokenCount).toBeGreaterThan(0);
  });

  it('honours the select option and reports registered-empty types', async () => {
    const docsOnly = await caseCorpus(caseId, { include: ['document'] });
    expect(docsOnly.items.every((i) => i.type === 'document')).toBe(true);
    expect(docsOnly.registeredEmpty).toHaveLength(0);

    const withEmails = await caseCorpus(caseId, {
      include: ['document', 'email', 'time_entry'],
    });
    expect(withEmails.registeredEmpty).toEqual(['email', 'time_entry']);
  });

  it('caches and invalidates', async () => {
    const a = await caseCorpus(caseId, { include: ['case_record'] });
    const b = await caseCorpus(caseId, { include: ['case_record'] });
    expect(a).toBe(b); // same cached reference
    invalidateCorpus(caseId);
    const c = await caseCorpus(caseId, { include: ['case_record'] });
    expect(c).not.toBe(a); // rebuilt after invalidation
  });
});
