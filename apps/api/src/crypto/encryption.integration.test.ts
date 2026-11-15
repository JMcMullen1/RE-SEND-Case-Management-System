import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import { getDb } from '../db/client';
import { buildServer } from '../server';
import { getStorageProvider } from '../storage';
import type { UserSummary } from '../repositories/users';
import { FIELD_PREFIX, isEncryptedFile } from './encryption';
import { runEncryptionBackfill } from './backfill';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('encryption of sensitive fields and documents', () => {
  let users: UserSummary[] = [];
  const admin = () => users.find((u) => u.role === 'admin')!;
  const as = (u: { id: string }) => ({ 'x-user-id': u.id });
  const stamp = Date.now().toString(36);
  let caseId = '';
  let childId = '';
  let clientId = '';

  const raw = async (q: ReturnType<typeof sql>) =>
    (await getDb().execute(q)) as unknown as Record<string, string | null>[];

  beforeAll(async () => {
    const app = await buildServer();
    users = (await app.inject({ method: 'GET', url: '/api/users' })).json()
      .users;
    caseId = (
      await app.inject({
        method: 'POST',
        url: '/api/cases',
        headers: as(admin()),
        payload: {
          client: {
            fullName: `Crypto Parent ${stamp}`,
            additionalNeeds: 'Parent has a hearing impairment',
          },
          child: {
            fullName: `Crypto Child ${stamp}`,
            sendNeeds: 'Autism and a speech and language disorder',
          },
          case: { currentWork: 'Section Appeal', aims: 'Specialist placement' },
        },
      })
    ).json().caseId;
    const [row] = await raw(
      sql`SELECT client_id, child_id FROM cases WHERE id = ${caseId}`,
    );
    clientId = row!.client_id!;
    childId = row!.child_id!;
    await app.close();
  });

  it('stores the sensitive fields encrypted and shows them decrypted', async () => {
    const [stored] = await raw(sql`
      SELECT ch.send_needs, cl.additional_needs, c.aims
      FROM cases c JOIN children ch ON ch.id = c.child_id JOIN clients cl ON cl.id = c.client_id
      WHERE c.id = ${caseId}`);
    for (const value of Object.values(stored!)) {
      expect(value!.startsWith(FIELD_PREFIX)).toBe(true);
      expect(value).not.toMatch(/speech|hearing|placement/i);
    }
    const app = await buildServer();
    const detail = (
      await app.inject({
        method: 'GET',
        url: `/api/cases/${caseId}/detail`,
        headers: as(admin()),
      })
    ).json();
    await app.close();
    expect(detail.child.sendNeeds).toBe(
      'Autism and a speech and language disorder',
    );
    expect(detail.client.additionalNeeds).toBe(
      'Parent has a hearing impairment',
    );
    expect(detail.aims).toBe('Specialist placement');
  });

  it('keeps an edit encrypted, in the record and in the audit trail', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/children/${childId}`,
      headers: as(admin()),
      payload: { sendNeeds: 'Dyslexia and anxiety' },
    });
    await app.close();
    expect(res.statusCode).toBe(200);
    const [audit] = await raw(sql`
      SELECT after::text AS after FROM audit_log
      WHERE action = 'child.update' AND entity_id = ${childId}
      ORDER BY created_at DESC LIMIT 1`);
    expect(audit!.after).toContain(FIELD_PREFIX);
    expect(audit!.after).not.toMatch(/dyslexia|anxiety/i);
  });

  it('stores document files encrypted, and serves and exports them readable', async () => {
    const app = await buildServer();
    const boundary = '----cryptotest';
    const text = `EP report ${stamp}: weekly therapy recommended.`;
    const upload = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/documents?category=Expert%20Report`,
      headers: {
        ...as(admin()),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="ep-${stamp}.txt"\r\nContent-Type: text/plain\r\n\r\n`,
        ),
        Buffer.from(text),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
    });
    const docId = (upload.json().document?.id ?? upload.json().id) as string;
    const [doc] = await raw(
      sql`SELECT storage_key FROM documents WHERE id = ${docId}`,
    );
    const stored = await getStorageProvider().getRaw(doc!.storage_key!);
    expect(isEncryptedFile(stored!.body)).toBe(true);
    expect(stored!.body.includes(Buffer.from('therapy'))).toBe(false);

    const content = await app.inject({
      method: 'GET',
      url: `/api/documents/${docId}/content`,
      headers: as(admin()),
    });
    expect(content.body).toBe(text);

    const exported = await app.inject({
      method: 'GET',
      url: '/api/admin/export',
      headers: as(admin()),
    });
    await app.close();
    const files = unzipSync(new Uint8Array(exported.rawPayload));
    const name = Object.keys(files).find((f) => f.endsWith(`ep-${stamp}.txt`))!;
    expect(strFromU8(files[name]!)).toBe(text);
    expect(strFromU8(files['data/children.csv']!)).toContain(
      'Dyslexia and anxiety',
    );
    expect(strFromU8(files['data/audit_log.csv']!)).not.toContain(
      `${FIELD_PREFIX}`,
    );
  });

  it('encrypts values and files stored before encryption, once', async () => {
    // As if written before encryption was switched on.
    await getDb().execute(
      sql`UPDATE clients SET additional_needs = 'Plain older text' WHERE id = ${clientId}`,
    );
    const key = `documents/${caseId}/${randomUUID()}`;
    await getStorageProvider().putRaw({
      key,
      contentType: 'text/plain',
      body: Buffer.from('Older plain file'),
    });
    await getDb().execute(sql`
      INSERT INTO documents (storage_key, original_filename, mime_type, byte_size, sha256,
                             uploaded_by_user_id, category, case_id, document_group_id, version)
      VALUES (${key}, ${`older-${stamp}.txt`}, 'text/plain', 16, ${`sha-${stamp}`},
              ${admin().id}, 'Other', ${caseId}, ${randomUUID()}, 1)`);

    const first = await runEncryptionBackfill();
    expect(first!.fields).toBeGreaterThanOrEqual(1);
    expect(first!.files).toBeGreaterThanOrEqual(1);
    const [client] = await raw(
      sql`SELECT additional_needs FROM clients WHERE id = ${clientId}`,
    );
    expect(client!.additional_needs!.startsWith(FIELD_PREFIX)).toBe(true);
    expect(
      isEncryptedFile((await getStorageProvider().getRaw(key))!.body),
    ).toBe(true);
    expect((await getStorageProvider().get(key))!.body.toString()).toBe(
      'Older plain file',
    );
    // Nothing left to do the second time.
    expect(await runEncryptionBackfill()).toMatchObject({
      fields: 0,
      files: 0,
    });
  });
});
