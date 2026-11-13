import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { buildServer } from '../server';
import { caseCorpus } from '../corpus/case-corpus';
import { invalidateCorpus } from '../corpus/cache';
import { buildEml, buildMsg } from '../email/fixtures';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

function multipart(filename: string, bytes: Buffer, type: string) {
  const boundary = '----resendemailtest';
  return {
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

run('email filing API', () => {
  let caseId = '';
  let staffAddress = '';
  const stamp = Date.now();
  const messageId = `<filing-${stamp}@example.org>`;
  const report = Buffer.from(`Fictional expert report ${stamp}`);

  beforeAll(async () => {
    const db = getDb();
    const [c] = (await db.execute(
      sql`SELECT id FROM cases WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    )) as unknown as { id: string }[];
    const [u] = (await db.execute(
      sql`SELECT email FROM users LIMIT 1`,
    )) as unknown as { email: string }[];
    caseId = c!.id;
    staffAddress = u!.email;
  });

  it('files an .eml with its attachment, and lists it', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/emails`,
      ...multipart(
        'Report.eml',
        buildEml({
          messageId,
          subject: `Expert report ${stamp}`,
          attachment: {
            filename: `report-${stamp}.txt`,
            mimeType: 'text/plain',
            content: report,
          },
        }),
        'message/rfc822',
      ),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.outcome).toBe('created');
    expect(body.email.direction).toBe('inbound');
    expect(body.email.attachments).toHaveLength(1);
    expect(body.email.attachments[0].category).toBe('Correspondence');

    const list = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/emails` })
    ).json();
    expect(
      list.emails.some((e: { id: string }) => e.id === body.email.id),
    ).toBe(true);

    // The attachment is a case document in its own right; the original email
    // file is not shown in the documents list.
    const docs = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/documents` })
    ).json().documents as { id: string; originalFilename: string }[];
    expect(docs.some((d) => d.originalFilename === `report-${stamp}.txt`)).toBe(
      true,
    );
    expect(docs.some((d) => d.id === body.email.rawDocumentId)).toBe(false);

    // The original file still downloads through the audited content route.
    const raw = await app.inject({
      method: 'GET',
      url: `/api/documents/${body.email.rawDocumentId}/content?download=1`,
    });
    expect(raw.statusCode).toBe(200);
    expect(raw.body).toContain(`Expert report ${stamp}`);
    await app.close();
  });

  it('records the same email once, even when re-filed as an Outlook .msg', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/emails`,
      ...multipart(
        'Report.msg',
        buildMsg({
          subject: `Expert report ${stamp}`,
          senderName: 'Sam Parent',
          senderSmtp: 'sam.parent@example.org',
          body: 'Please find the report attached.',
          sent: new Date('2025-10-01T08:30:00Z'),
          messageId,
          to: [{ name: 'Casework', smtp: 'casework@resend.test' }],
        }),
        'application/vnd.ms-outlook',
      ),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().outcome).toBe('duplicate');
    const list = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/emails` })
    ).json();
    expect(
      list.emails.filter(
        (e: { subject: string }) => e.subject === `Expert report ${stamp}`,
      ),
    ).toHaveLength(1);
    await app.close();
  });

  it('records an email filed twice at the same moment once, with no stray file', async () => {
    const app = await buildServer();
    const file = () =>
      app.inject({
        method: 'POST',
        url: `/api/cases/${caseId}/emails`,
        ...multipart(
          'Same time.eml',
          buildEml({
            messageId: `<race-${stamp}@example.org>`,
            subject: `Race ${stamp}`,
          }),
          'message/rfc822',
        ),
      });
    const results = await Promise.all([file(), file()]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(results.map((r) => r.json().outcome).sort()).toEqual([
      'created',
      'duplicate',
    ]);

    const list = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/emails` })
    ).json().emails as { subject: string }[];
    expect(list.filter((e) => e.subject === `Race ${stamp}`)).toHaveLength(1);
    const docs = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/documents` })
    ).json().documents as { originalFilename: string }[];
    expect(docs.some((d) => d.originalFilename === 'Same time.eml')).toBe(
      false,
    );
    await app.close();
  });

  it('marks email sent from a staff address as outbound', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/emails`,
      ...multipart(
        'Reply.eml',
        buildEml({
          messageId: `<reply-${stamp}@resend.example>`,
          from: `Caseworker <${staffAddress}>`,
          subject: `Reply ${stamp}`,
        }),
        'message/rfc822',
      ),
    });
    expect(res.json().email.direction).toBe('outbound');
    await app.close();
  });

  it('reads filed email into the case corpus', async () => {
    invalidateCorpus(caseId);
    const corpus = await caseCorpus(caseId, { include: ['email', 'document'] });
    const email = corpus.items.find(
      (i) => i.type === 'email' && i.title.includes(`Expert report ${stamp}`),
    );
    expect(email?.text).toContain('Please find the report attached.');
    expect(email?.text).toContain(`Attachments: report-${stamp}.txt`);
    expect(corpus.registeredEmpty).not.toContain('email');
    expect(corpus.excluded.some((e) => e.reason === 'email-source')).toBe(true);
  });

  it('refuses a file that is not an email, and an unknown case', async () => {
    const app = await buildServer();
    const bad = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/emails`,
      ...multipart(
        'renamed.eml',
        Buffer.from('%PDF-1.4\n%binary'),
        'message/rfc822',
      ),
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().message).toMatch(/does not look like an email/);

    const missing = await app.inject({
      method: 'POST',
      url: `/api/cases/00000000-0000-4000-8000-000000000000/emails`,
      ...multipart('a.eml', buildEml({}), 'message/rfc822'),
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('deletes an email filed in error (audited), keeping its attachments', async () => {
    const app = await buildServer();
    const list = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/emails` })
    ).json().emails as { id: string; subject: string }[];
    const target = list.find((e) => e.subject === `Expert report ${stamp}`)!;

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/cases/${caseId}/emails/${target.id}`,
    });
    expect(res.statusCode).toBe(200);

    const after = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/emails` })
    ).json().emails as { id: string }[];
    expect(after.some((e) => e.id === target.id)).toBe(false);

    const docs = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/documents` })
    ).json().documents as { originalFilename: string }[];
    expect(docs.some((d) => d.originalFilename === `report-${stamp}.txt`)).toBe(
      true,
    );

    const [audit] = (await getDb().execute(
      sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'email.delete' AND entity_id = ${target.id}`,
    )) as unknown as { n: number }[];
    expect(audit!.n).toBe(1);

    // Deleting it again finds nothing.
    const again = await app.inject({
      method: 'DELETE',
      url: `/api/cases/${caseId}/emails/${target.id}`,
    });
    expect(again.statusCode).toBe(404);
    await app.close();
  });

  it('keeps same-named attachments from different emails as separate documents', async () => {
    const app = await buildServer();
    const send = (n: number, content: string) =>
      app.inject({
        method: 'POST',
        url: `/api/cases/${caseId}/emails`,
        ...multipart(
          `scan-${n}.eml`,
          buildEml({
            messageId: `<scan-${n}-${stamp}@example.org>`,
            subject: `Scan ${n} ${stamp}`,
            attachment: {
              filename: `Scan-${stamp}.txt`,
              mimeType: 'text/plain',
              content: Buffer.from(content),
            },
          }),
          'message/rfc822',
        ),
      });
    await send(1, `A medical letter ${stamp}`);
    await send(2, `A school report ${stamp}`);
    const docs = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/documents` })
    ).json().documents as { originalFilename: string; versionCount: number }[];
    const scans = docs.filter(
      (d) => d.originalFilename === `Scan-${stamp}.txt`,
    );
    expect(scans).toHaveLength(2);
    expect(scans.every((d) => d.versionCount === 1)).toBe(true);
    await app.close();
  });

  it('can delete an email with the attachments it filed, keeping older files', async () => {
    const app = await buildServer();
    // A file already on the case before the email arrives.
    const existing = Buffer.from(`Already on file ${stamp}`);
    const boundary = '----resenddoc';
    await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/documents?category=Evidence`,
      payload: Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="kept-${stamp}.txt"\r\nContent-Type: text/plain\r\n\r\n`,
        ),
        existing,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    });

    const eml = (filename: string, content: Buffer) =>
      [
        'From: Sam Parent <sam.parent@example.org>',
        'To: casework@resend.test',
        `Subject: Wrong case ${stamp}`,
        `Message-ID: <wrong-${stamp}@example.org>`,
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="x"',
        '',
        '--x',
        'Content-Type: text/plain',
        '',
        'Two files.',
        '--x',
        `Content-Type: text/plain; name="${filename}"`,
        `Content-Disposition: attachment; filename="${filename}"`,
        '',
        content.toString(),
        '--x',
        `Content-Type: text/plain; name="new-${stamp}.txt"`,
        `Content-Disposition: attachment; filename="new-${stamp}.txt"`,
        '',
        `Only in this email ${stamp}`,
        '--x--',
        '',
      ].join('\r\n');
    const filed = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/emails`,
      ...multipart(
        'wrong.eml',
        Buffer.from(eml(`kept-${stamp}.txt`, existing)),
        'message/rfc822',
      ),
    });
    const email = filed.json().email as { id: string };

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/cases/${caseId}/emails/${email.id}?attachments=true`,
    });
    expect(res.json()).toEqual({ deleted: true, attachmentsDeleted: 1 });
    const docs = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/documents` })
    ).json().documents as { originalFilename: string }[];
    expect(docs.some((d) => d.originalFilename === `kept-${stamp}.txt`)).toBe(
      true,
    );
    expect(docs.some((d) => d.originalFilename === `new-${stamp}.txt`)).toBe(
      false,
    );
    await app.close();
  });
});
