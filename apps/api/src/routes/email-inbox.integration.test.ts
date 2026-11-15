import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { auditLog, emailInbox, emails } from '../db/schema';
import { buildServer } from '../server';
import { buildEml } from '../email/fixtures';
import type { UserSummary } from '../repositories/users';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

function multipart(filename: string, bytes: Buffer) {
  const boundary = '----resendinboxtest';
  return {
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: message/rfc822\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

run('emails to file API', () => {
  let users: UserSummary[] = [];
  const as = (u: { id: string }) => ({ 'x-user-id': u.id });
  const worker = () => users.find((u) => u.role === 'caseworker')!;
  const readOnly = () => users.find((u) => u.role === 'read_only');
  const stamp = Date.now();
  // Made-up families: one parent with two children's cases, one with one.
  const twoKids = `twins.parent.${stamp}@example.org`;
  const oneKid = `solo.parent.${stamp}@example.org`;
  let caseA = '';
  let caseB = '';
  let caseC = '';

  beforeAll(async () => {
    const app = await buildServer();
    users = (await app.inject({ method: 'GET', url: '/api/users' })).json()
      .users;
    const create = async (client: object, child: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/api/cases',
          headers: as(worker()),
          payload: {
            client,
            child: { fullName: child },
            case: { currentWork: 'Section Appeal' },
          },
        })
      ).json().caseId as string;
    caseA = await create(
      { fullName: `Twin Parent ${stamp}`, email: twoKids },
      `Alder Inboxkid${stamp}`,
    );
    // The sibling's case: the same client, a second child.
    const [aClient] = (await getDb().execute(
      sql`SELECT client_id FROM cases WHERE id = ${caseA}`,
    )) as unknown as { client_id: string }[];
    caseB = (
      await app.inject({
        method: 'POST',
        url: '/api/cases',
        headers: as(worker()),
        payload: {
          existingClientId: aClient!.client_id,
          child: { fullName: `Birch Inboxkid${stamp}` },
          case: { currentWork: 'Annual Review' },
        },
      })
    ).json().caseId as string;
    caseC = await create(
      { fullName: `Solo Parent ${stamp}`, email: oneKid },
      `Cedar Solokid${stamp}`,
    );
    await app.close();
  });

  const send = async (
    app: Awaited<ReturnType<typeof buildServer>>,
    eml: Buffer,
    user = worker(),
  ) =>
    app.inject({
      method: 'POST',
      url: '/api/email-inbox',
      headers: { ...as(user), ...multipart('mail.eml', eml).headers },
      payload: multipart('mail.eml', eml).payload,
    });

  it('files an email from a parent with one case straight to it', async () => {
    expect(caseA && caseB && caseC).toBeTruthy();
    const app = await buildServer();
    const res = await send(
      app,
      buildEml({
        messageId: `<solo-${stamp}@example.org>`,
        from: `Solo Parent <${oneKid}>`,
        subject: 'A question',
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      outcome: 'filed',
      caseId: caseC,
      reasons: ['client_email'],
    });
    const [audit] = await getDb()
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, res.json().emailId),
          eq(auditLog.action, 'email.auto_file'),
        ),
      );
    expect(audit!.after).toMatchObject({ caseId: caseC });

    // Dropped in again: already on the case.
    const again = await send(
      app,
      buildEml({
        messageId: `<solo-${stamp}@example.org>`,
        from: `Solo Parent <${oneKid}>`,
      }),
    );
    expect(again.json()).toMatchObject({ outcome: 'duplicate', caseId: caseC });
    await app.close();
  });

  it('lists an ambiguous email with both siblings’ cases, then files it where chosen', async () => {
    const app = await buildServer();
    const res = await send(
      app,
      buildEml({
        messageId: `<twins-${stamp}@example.org>`,
        from: `Twin Parent <${twoKids}>`,
        subject: 'School transport',
        body: 'Hello, a question about transport.',
      }),
    );
    expect(res.json().outcome).toBe('queued');
    const item = res.json().item;
    expect(
      item.suggestions.map((s: { caseId: string }) => s.caseId).sort(),
    ).toEqual([caseA, caseB].sort());

    // Waiting: listed and counted; the same email is not added twice.
    const list = (
      await app.inject({ method: 'GET', url: '/api/email-inbox' })
    ).json();
    expect(list.items.some((i: { id: string }) => i.id === item.id)).toBe(true);
    const twice = await send(
      app,
      buildEml({
        messageId: `<twins-${stamp}@example.org>`,
        from: `Twin Parent <${twoKids}>`,
      }),
    );
    expect(twice.json()).toEqual({
      outcome: 'already_waiting',
      itemId: item.id,
    });

    const text = await app.inject({
      method: 'GET',
      url: `/api/email-inbox/${item.id}/text`,
    });
    expect(text.json().bodyText).toContain('transport');

    // Read-only users may look but not file.
    if (readOnly()) {
      const refused = await app.inject({
        method: 'POST',
        url: `/api/email-inbox/${item.id}/file`,
        headers: as(readOnly()!),
        payload: { caseId: caseB },
      });
      expect(refused.statusCode).toBe(403);
    }

    const filed = await app.inject({
      method: 'POST',
      url: `/api/email-inbox/${item.id}/file`,
      headers: as(worker()),
      payload: { caseId: caseB },
    });
    expect(filed.statusCode).toBe(200);
    expect(filed.json()).toMatchObject({ outcome: 'filed', caseId: caseB });
    const [onCase] = await getDb()
      .select({ caseId: emails.caseId })
      .from(emails)
      .where(eq(emails.id, filed.json().emailId));
    expect(onCase!.caseId).toBe(caseB);
    const [row] = await getDb()
      .select()
      .from(emailInbox)
      .where(eq(emailInbox.id, item.id));
    expect(row).toMatchObject({ status: 'filed', filedCaseId: caseB });

    // Dealt with: a second attempt is refused.
    const late = await app.inject({
      method: 'POST',
      url: `/api/email-inbox/${item.id}/file`,
      headers: as(worker()),
      payload: { caseId: caseA },
    });
    expect(late.statusCode).toBe(409);
    await app.close();
  });

  it('files to the right sibling when the email names the child', async () => {
    const app = await buildServer();
    const res = await send(
      app,
      buildEml({
        messageId: `<named-${stamp}@example.org>`,
        from: `Twin Parent <${twoKids}>`,
        body: `About Alder Inboxkid${stamp}'s annual review.`,
      }),
    );
    expect(res.json()).toMatchObject({ outcome: 'filed', caseId: caseA });
    await app.close();
  });

  it('keeps an email that matches nothing, and lets it be dismissed', async () => {
    const app = await buildServer();
    const res = await send(
      app,
      buildEml({
        messageId: `<stranger-${stamp}@example.org>`,
        from: `Nobody <nobody.${stamp}@example.org>`,
        subject: 'Newsletter',
      }),
    );
    expect(res.json().outcome).toBe('queued');
    expect(res.json().item.suggestions).toEqual([]);
    const id = res.json().item.id;
    const gone = await app.inject({
      method: 'POST',
      url: `/api/email-inbox/${id}/dismiss`,
      headers: as(worker()),
    });
    expect(gone.json()).toEqual({ dismissed: true });
    const list = (
      await app.inject({ method: 'GET', url: '/api/email-inbox' })
    ).json();
    expect(list.items.some((i: { id: string }) => i.id === id)).toBe(false);
    await app.close();
  });

  it('never files a second copy when the email was filed on a case meanwhile', async () => {
    const app = await buildServer();
    const bytes = buildEml({
      messageId: `<meanwhile-${stamp}@example.org>`,
      from: `Twin Parent <${twoKids}>`,
      subject: 'Meanwhile',
    });
    const queued = await send(app, bytes);
    expect(queued.json().outcome).toBe('queued');
    // Someone files it straight on case A from the case's own Emails tab.
    const direct = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseA}/emails`,
      headers: { ...as(worker()), ...multipart('mail.eml', bytes).headers },
      payload: multipart('mail.eml', bytes).payload,
    });
    expect(direct.json().outcome).toBe('created');
    // Then someone else chooses case B in the list: it stays on A only.
    const res = await app.inject({
      method: 'POST',
      url: `/api/email-inbox/${queued.json().item.id}/file`,
      headers: as(worker()),
      payload: { caseId: caseB },
    });
    expect(res.json()).toMatchObject({ outcome: 'duplicate', caseId: caseA });
    const onB = await getDb()
      .select({ id: emails.id })
      .from(emails)
      .where(
        and(
          eq(emails.caseId, caseB),
          eq(emails.dedupKey, `mid:meanwhile-${stamp}@example.org`),
        ),
      );
    expect(onB).toEqual([]);
    const onA = await getDb()
      .select({ id: emails.id })
      .from(emails)
      .where(
        and(
          eq(emails.caseId, caseA),
          eq(emails.dedupKey, `mid:meanwhile-${stamp}@example.org`),
        ),
      );
    expect(onA).toHaveLength(1);
    await app.close();
  });

  it('lets only one person file an email at a time', async () => {
    const app = await buildServer();
    const queued = await send(
      app,
      buildEml({
        messageId: `<race-inbox-${stamp}@example.org>`,
        from: `Twin Parent <${twoKids}>`,
        subject: 'Race',
      }),
    );
    const id = queued.json().item.id;
    const [one, two] = await Promise.all(
      [caseA, caseB].map((caseId) =>
        app.inject({
          method: 'POST',
          url: `/api/email-inbox/${id}/file`,
          headers: as(worker()),
          payload: { caseId },
        }),
      ),
    );
    expect([one!.statusCode, two!.statusCode].sort()).toEqual([200, 409]);
    const copies = await getDb()
      .select({ id: emails.id })
      .from(emails)
      .where(eq(emails.dedupKey, `mid:race-inbox-${stamp}@example.org`));
    expect(copies).toHaveLength(1);
    await app.close();
  });

  it('refuses a file that is not an email', async () => {
    const app = await buildServer();
    const res = await send(app, Buffer.from(''));
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
