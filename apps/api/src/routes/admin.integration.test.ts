import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import { getDb } from '../db/client';
import { buildServer } from '../server';
import {
  databaseTables,
  EXPORT_EXCLUDED_TABLES,
  EXPORT_TABLES,
} from '../repositories/export';
import type { UserSummary } from '../repositories/users';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('staff admin and data export API', () => {
  let users: UserSummary[] = [];
  const stamp = Date.now();
  const admin = () => users.find((u) => u.role === 'admin')!;
  const worker = () => users.find((u) => u.role === 'caseworker')!;
  const as = (u: { id: string }) => ({ 'x-user-id': u.id });
  let exported: Uint8Array | null = null;
  const upload = (body: Uint8Array | Buffer, name = 'backup.zip') => {
    const boundary = `----restore${stamp}`;
    return {
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/zip\r\n\r\n`,
        ),
        Buffer.from(body),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
    };
  };

  beforeAll(async () => {
    const app = await buildServer();
    users = (await app.inject({ method: 'GET', url: '/api/users' })).json()
      .users;
    await app.close();
  });

  it('lets only an admin manage staff', async () => {
    const app = await buildServer();
    for (const [method, url] of [
      ['GET', '/api/admin/staff'],
      ['POST', '/api/admin/staff'],
      ['GET', '/api/admin/export'],
    ] as const) {
      const r = await app.inject({
        method,
        url,
        headers: as(worker()),
        payload:
          method === 'POST'
            ? { displayName: 'X', email: 'x@y.org', role: 'caseworker' }
            : undefined,
      });
      expect(r.statusCode).toBe(403);
    }
    await app.close();
  });

  it('adds a joiner, refuses a duplicate email, and edits roles within the rules', async () => {
    const app = await buildServer();
    const email = `new.starter.${stamp}@resend.example`;
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/staff',
      headers: as(admin()),
      payload: {
        displayName: 'New Starter',
        email: `  ${email.toUpperCase()} `,
        role: 'caseworker',
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().email).toBe(email);
    const id = created.json().id as string;

    // Appears in every staff picker straight away.
    const pickers = (
      await app.inject({ method: 'GET', url: '/api/users' })
    ).json().users as { id: string }[];
    expect(pickers.some((u) => u.id === id)).toBe(true);

    const dupe = await app.inject({
      method: 'POST',
      url: '/api/admin/staff',
      headers: as(admin()),
      payload: { displayName: 'Someone', email, role: 'finance' },
    });
    expect(dupe.statusCode).toBe(409);

    const bad = await app.inject({
      method: 'POST',
      url: '/api/admin/staff',
      headers: as(admin()),
      payload: {
        displayName: 'Someone',
        email: 'not-an-email',
        role: 'finance',
      },
    });
    expect(bad.statusCode).toBe(400);

    const promoted = await app.inject({
      method: 'PATCH',
      url: `/api/admin/staff/${id}`,
      headers: as(admin()),
      payload: { role: 'admin' },
    });
    expect(promoted.json().role).toBe('admin');

    // An admin cannot remove their own admin access.
    const self = await app.inject({
      method: 'PATCH',
      url: `/api/admin/staff/${admin().id}`,
      headers: as(admin()),
      payload: { role: 'caseworker' },
    });
    expect(self.statusCode).toBe(409);

    const back = await app.inject({
      method: 'PATCH',
      url: `/api/admin/staff/${id}`,
      headers: as(admin()),
      payload: { role: 'caseworker' },
    });
    expect(back.json().role).toBe('caseworker');
    await app.close();
  });

  it('marks a leaver, hands their open cases to a queue, and can bring them back', async () => {
    const app = await buildServer();
    const leaver = (
      await app.inject({
        method: 'POST',
        url: '/api/admin/staff',
        headers: as(admin()),
        payload: {
          displayName: 'Leaving Soon',
          email: `leaving.${stamp}@resend.example`,
          role: 'caseworker',
        },
      })
    ).json();
    const caseId = (
      await app.inject({
        method: 'POST',
        url: '/api/cases',
        headers: as(admin()),
        payload: {
          client: { fullName: 'Handover Parent' },
          child: { fullName: 'Handover Child' },
          case: { currentWork: 'Section Appeal' },
        },
      })
    ).json().caseId;
    await getDb().execute(
      sql`UPDATE cases SET owner_user_id = ${leaver.id}, owner_queue = NULL WHERE id = ${caseId}`,
    );
    const listed = (
      await app.inject({
        method: 'GET',
        url: '/api/admin/staff',
        headers: as(admin()),
      })
    ).json().staff as { id: string; openCaseCount: number }[];
    expect(listed.find((s) => s.id === leaver.id)?.openCaseCount).toBe(1);

    // Nobody can mark themselves as having left.
    const selfLeave = await app.inject({
      method: 'POST',
      url: `/api/admin/staff/${admin().id}/deactivate`,
      headers: as(admin()),
      payload: { handover: { kind: 'none' } },
    });
    expect(selfLeave.statusCode).toBe(409);

    // Cases cannot go to someone who does not work cases.
    const readOnly = users.find((u) => u.role === 'read_only')!;
    const toReadOnly = await app.inject({
      method: 'POST',
      url: `/api/admin/staff/${leaver.id}/deactivate`,
      headers: as(admin()),
      payload: { handover: { kind: 'user', userId: readOnly.id } },
    });
    expect(toReadOnly.statusCode).toBe(409);

    // Their calendar feed works until they leave...
    const token = 'leaver-feed-' + stamp;
    await getDb().execute(
      sql`UPDATE users SET ical_token = ${token} WHERE id = ${leaver.id}`,
    );
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/calendar/feed/${token}.ics`,
        })
      ).statusCode,
    ).toBe(200);

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/staff/${leaver.id}/deactivate`,
      headers: as(admin()),
      payload: { handover: { kind: 'queue', queue: 'Enquiries' } },
    });
    // ...and stops when they do.
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/calendar/feed/${token}.ics`,
        })
      ).statusCode,
    ).toBe(404);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      member: { active: false, openCaseCount: 0 },
      casesHandedOver: 1,
    });
    const [kase] = (await getDb().execute(
      sql`SELECT owner_user_id, owner_queue FROM cases WHERE id = ${caseId}`,
    )) as unknown as { owner_user_id: string | null; owner_queue: string }[];
    expect(kase).toMatchObject({
      owner_user_id: null,
      owner_queue: 'Enquiries',
    });

    // Gone from the staff pickers.
    const pickers = (
      await app.inject({ method: 'GET', url: '/api/users' })
    ).json().users as { id: string }[];
    expect(pickers.some((u) => u.id === leaver.id)).toBe(false);

    const [audit] = (await getDb().execute(
      sql`SELECT count(*)::int AS n FROM audit_log
          WHERE (entity_id = ${leaver.id} AND action = 'staff.deactivate')
             OR (entity_id = ${caseId} AND action = 'case.reassign_owner')`,
    )) as unknown as { n: number }[];
    expect(audit!.n).toBe(2);

    const back = await app.inject({
      method: 'POST',
      url: `/api/admin/staff/${leaver.id}/reactivate`,
      headers: as(admin()),
    });
    expect(back.json().active).toBe(true);
    await app.close();
  });

  it('exports every table and every document as an audited ZIP', async () => {
    // Completeness: every table in the database is exported or deliberately
    // excluded, so a new table can never be silently left out.
    const known = new Set([
      ...EXPORT_TABLES.map((t) => t.table),
      ...EXPORT_EXCLUDED_TABLES,
    ]);
    expect((await databaseTables()).filter((t) => !known.has(t))).toEqual([]);

    const app = await buildServer();
    // A document to find in the archive.
    const [c] = (await getDb().execute(
      sql`SELECT id, case_reference FROM cases WHERE deleted_at IS NULL LIMIT 1`,
    )) as unknown as { id: string; case_reference: string }[];
    const boundary = '----exporttest';
    await app.inject({
      method: 'POST',
      url: `/api/cases/${c!.id}/documents?category=Other`,
      headers: {
        ...as(admin()),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="export-${stamp}.txt"\r\nContent-Type: text/plain\r\n\r\n`,
        ),
        Buffer.from(`Export check ${stamp}`),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
    });

    const exportStarted = new Date().toISOString();
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/export',
      headers: as(admin()),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition']).toMatch(/resend-export-.*\.zip/);

    const files = unzipSync(new Uint8Array(res.rawPayload));
    expect(strFromU8(files['README.txt']!)).toMatch(/special category/);
    for (const { table } of EXPORT_TABLES) {
      expect(files[`data/${table}.csv`], table).toBeDefined();
    }
    const usersCsv = strFromU8(files['data/users.csv']!);
    expect(usersCsv).toContain('email');
    expect(usersCsv).not.toContain('ical_token');
    expect(strFromU8(files['data/cases.csv']!)).toContain(c!.case_reference);
    expect(
      strFromU8(files[`documents/${c!.case_reference}/export-${stamp}.txt`]!),
    ).toBe(`Export check ${stamp}`);

    // What Full import needs to put it all back.
    const restore = JSON.parse(strFromU8(files['restore/manifest.json']!));
    expect(restore.format).toBe('resend-backup');
    for (const { table } of EXPORT_TABLES)
      expect(files[`restore/tables/${table}.ndjson`], table).toBeDefined();
    for (const f of restore.files) expect(files[f.path], f.path).toBeDefined();
    exported = new Uint8Array(res.rawPayload);

    // Written last: proof the export finished, with counts.
    const manifest = strFromU8(files['MANIFEST.txt']!);
    expect(manifest).toMatch(/Export complete/);
    expect(manifest).toMatch(/cases: \d+ rows/);

    // Both the start and the finished outcome are audited. The outcome is
    // written once the stream has ended, so wait for it (a slow machine can
    // take longer than the response), and count only this export's entries.
    const actions = async () =>
      new Set(
        (
          (await getDb().execute(
            sql`SELECT action FROM audit_log
                WHERE action IN ('export.download', 'export.complete')
                  AND actor_user_id = ${admin().id}
                  AND created_at >= ${exportStarted}`,
          )) as unknown as { action: string }[]
        ).map((a) => a.action),
      );
    const deadline = Date.now() + 5000;
    while ((await actions()).size < 2 && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 50));
    expect(await actions()).toEqual(
      new Set(['export.download', 'export.complete']),
    );
    await app.close();
  });

  it('checks a full export before putting it back, and refuses anything else', async () => {
    const app = await buildServer();
    const notAdmin = upload(Buffer.from('x'));
    const refused = await app.inject({
      method: 'POST',
      url: '/api/admin/restore/check',
      headers: { ...notAdmin.headers, ...as(worker()) },
      payload: notAdmin.payload,
    });
    expect(refused.statusCode).toBe(403);

    const junk = upload(Buffer.from('not a zip at all'));
    const bad = await app.inject({
      method: 'POST',
      url: '/api/admin/restore/check',
      headers: { ...junk.headers, ...as(admin()) },
      payload: junk.payload,
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().message).toMatch(/full export/);

    expect(exported).not.toBeNull();
    const good = upload(exported!);
    const checked = await app.inject({
      method: 'POST',
      url: '/api/admin/restore/check',
      headers: { ...good.headers, ...as(admin()) },
      payload: good.payload,
    });
    expect(checked.statusCode).toBe(200);
    const { id, summary } = checked.json();
    expect(summary.tables).toBe(EXPORT_TABLES.length);
    expect(summary.rows).toBeGreaterThan(0);

    // Only with REPLACE typed, and only by the admin who checked it. (The
    // replacing itself is covered end to end: here other tests share the
    // database.)
    const noConfirm = await app.inject({
      method: 'POST',
      url: `/api/admin/restore/${id}`,
      headers: as(admin()),
      payload: { confirm: 'yes' },
    });
    expect(noConfirm.statusCode).toBe(400);
    const otherUser = await app.inject({
      method: 'POST',
      url: `/api/admin/restore/${id}`,
      headers: as(worker()),
      payload: { confirm: 'REPLACE' },
    });
    expect(otherUser.statusCode).toBe(403);
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/admin/restore/00000000-0000-4000-8000-000000000000',
      headers: as(admin()),
      payload: { confirm: 'REPLACE' },
    });
    expect(unknown.statusCode).toBe(422);
    await app.close();
  });
});
