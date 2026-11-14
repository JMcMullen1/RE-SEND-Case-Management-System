import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { matchImportHeadings } from '@re-send/shared';
import { getDb } from '../db/client';
import { buildServer } from '../server';
import type { UserSummary } from '../repositories/users';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('case list import API', () => {
  let users: UserSummary[] = [];
  const admin = () => users.find((u) => u.role === 'admin')!;
  const worker = () => users.find((u) => u.role === 'caseworker')!;
  const as = (u: { id: string }) => ({ 'x-user-id': u.id });
  const stamp = Date.now();
  const headings = [
    'Date of enquiry',
    'Allocated to',
    'Status',
    'Client Name',
    'Email',
    "Child's Name",
    'Current Work',
    'Current Team',
    'Notes',
    'Payment Details',
  ];
  // Made-up families: two siblings, and a row with a problem.
  const email = `import.parent.${stamp}@example.org`;
  const rows = [
    [
      '01/09/2026',
      'TSA Team',
      'Closed',
      `Imp Parent ${stamp}`,
      email,
      'Robin',
      'Section BF&I',
      'TSA',
      '15/09/2026 - passed to TSA',
      'PM',
    ],
    [
      '02/09/2026',
      'Enquiries',
      'Active',
      `Imp Parent ${stamp}`,
      email,
      'Sky',
      'Annual Review',
      'TSA / ISA',
      '',
      '',
    ],
    ['', 'Enquiries', 'Active', 'No Date', '', 'Nobody', '', '', '', ''],
  ];
  const body = () => ({
    rows,
    firstRowNumber: 2,
    mapping: matchImportHeadings(headings),
    valueMaps: {},
  });

  beforeAll(async () => {
    const app = await buildServer();
    users = (await app.inject({ method: 'GET', url: '/api/users' })).json()
      .users;
    await app.close();
  });

  it('is for admins only', async () => {
    const app = await buildServer();
    for (const url of [
      '/api/admin/import/cases/preview',
      '/api/admin/import/cases',
    ]) {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: as(worker()),
        payload: {
          ...body(),
          expectedFingerprint: 'f'.repeat(64),
          expectedToImport: 1,
        },
      });
      expect(res.statusCode).toBe(403);
    }
    await app.close();
  });

  it('previews without changing anything, then imports exactly what it showed', async () => {
    const app = await buildServer();
    const count = async () =>
      (
        (await getDb().execute(
          sql`SELECT count(*)::int AS n FROM cases`,
        )) as unknown as { n: number }[]
      )[0]!.n;
    const before = await count();
    const preview = await app.inject({
      method: 'POST',
      url: '/api/admin/import/cases/preview',
      headers: as(admin()),
      payload: body(),
    });
    expect(preview.statusCode).toBe(200);
    const analysis = preview.json();
    expect(analysis.summary).toMatchObject({
      total: 3,
      toImport: 2,
      problems: 1,
    });
    expect(analysis.rows[0].shown.currentWork).toBe('Section B F & I');
    expect(analysis.rows[0]).not.toHaveProperty('plan');
    expect(await count()).toBe(before);

    // A list or matches other than those previewed are refused, and
    // nothing is imported.
    const fingerprint = analysis.fingerprint as string;
    const changed = await app.inject({
      method: 'POST',
      url: '/api/admin/import/cases',
      headers: as(admin()),
      payload: {
        ...body(),
        valueMaps: { status: { Odd: 'Active' } },
        expectedFingerprint: fingerprint,
        expectedToImport: 2,
      },
    });
    expect(changed.statusCode).toBe(409);
    const stale = await app.inject({
      method: 'POST',
      url: '/api/admin/import/cases',
      headers: as(admin()),
      payload: {
        ...body(),
        expectedFingerprint: fingerprint,
        expectedToImport: 3,
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(await count()).toBe(before);

    const done = await app.inject({
      method: 'POST',
      url: '/api/admin/import/cases',
      headers: as(admin()),
      payload: {
        ...body(),
        expectedFingerprint: fingerprint,
        expectedToImport: 2,
      },
    });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({
      casesCreated: 2,
      clientsCreated: 1,
      childrenCreated: 2,
      problemsSkipped: 1,
    });
    const batchId = done.json().batchId as string;

    // Siblings share one client; values, teams, owner and note came through.
    const imported = (await getDb().execute(
      sql`SELECT c.case_reference, c.status, c.current_work, c.owner_queue,
                 c.payment_code, c.date_of_enquiry::text AS doe, c.client_id,
                 (SELECT count(*)::int FROM case_teams t WHERE t.case_id = c.id) AS teams,
                 (SELECT n.entry_date::text FROM case_notes n WHERE n.case_id = c.id) AS note_date
          FROM cases c JOIN clients cl ON cl.id = c.client_id
          WHERE cl.email = ${email} ORDER BY c.date_of_enquiry`,
    )) as unknown as Record<string, unknown>[];
    expect(imported).toHaveLength(2);
    expect(imported[0]).toMatchObject({
      status: 'Closed',
      current_work: 'Section B F & I',
      owner_queue: 'TSA Team',
      payment_code: 'PM',
      doe: '2026-09-01',
      teams: 1,
      note_date: '2026-09-15',
    });
    expect(imported[0]!.case_reference).toMatch(/^RS-2026-/);
    expect(imported[1]).toMatchObject({ teams: 2, note_date: null });
    expect(imported[0]!.client_id).toBe(imported[1]!.client_id);

    // Audited: each case, and the import with its counts.
    const audits = (await getDb().execute(
      sql`SELECT action, count(*)::int AS n FROM audit_log
          WHERE (action = 'import.cases' AND entity_id = ${batchId})
             OR (action = 'case.create' AND after->>'batchId' = ${batchId})
          GROUP BY action ORDER BY action`,
    )) as unknown as { action: string; n: number }[];
    expect(audits).toEqual([
      { action: 'case.create', n: 2 },
      { action: 'import.cases', n: 1 },
    ]);

    // Running the same list again imports nothing new.
    const again = (
      await app.inject({
        method: 'POST',
        url: '/api/admin/import/cases/preview',
        headers: as(admin()),
        payload: body(),
      })
    ).json();
    expect(again.summary).toMatchObject({ toImport: 0, duplicates: 2 });
    await app.close();
  });
});
