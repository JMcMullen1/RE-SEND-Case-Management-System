import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import type { ImportedSchool } from '@re-send/shared';
import { getDb } from '../db/client';
import { auditLog, schools } from '../db/schema';
import { buildServer } from '../server';
import type { UserSummary } from '../repositories/users';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('school import API', () => {
  let users: UserSummary[] = [];
  const admin = () => users.find((u) => u.role === 'admin')!;
  const worker = () => users.find((u) => u.role === 'caseworker')!;
  const as = (u: { id: string }) => ({ 'x-user-id': u.id });
  // URNs no other test uses: 7 digits from this run's clock.
  const base = 9_000_000 + (Date.now() % 900_000);
  const urn = (n: number) => String(base + n);
  const tag = String(base);

  const school = (n: number, over: Partial<ImportedSchool> = {}) =>
    ({
      urn: urn(n),
      name: `Imported School ${tag}-${n}`,
      address: '1 School Lane, Testtown',
      postcode: 'TT1 1AA',
      localAuthority: 'Testshire',
      phone: '01234567890',
      website: 'https://school.example',
      funding: 'academy',
      provision: 'mainstream',
      section41: false,
      ageFrom: 4,
      ageTo: 11,
      ...over,
    }) satisfies ImportedSchool;

  beforeAll(async () => {
    const app = await buildServer();
    users = (await app.inject({ method: 'GET', url: '/api/users' })).json()
      .users;
    await app.close();
  });

  it('is for admins only', async () => {
    const app = await buildServer();
    for (const url of [
      '/api/admin/import/schools/preview',
      '/api/admin/import/schools',
    ]) {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: as(worker()),
        payload: { schools: [school(0)] },
      });
      expect(res.statusCode).toBe(403);
    }
    await app.close();
  });

  it('refuses a school that is not in the expected shape', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/import/schools/preview',
      headers: as(admin()),
      payload: { schools: [{ ...school(0), urn: 'abc' }] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('previews, then adds, refreshes and recognises schools — and a second run changes nothing', async () => {
    const app = await buildServer();
    // Already in the directory: one with the URN, one added by hand without.
    const withUrn = (
      await app.inject({
        method: 'POST',
        url: '/api/schools',
        headers: as(admin()),
        payload: {
          name: `Old Name ${tag}`,
          urn: urn(1),
          postcode: 'TT1 1AA',
          provision: 'specialist',
          notes: 'Kept as it is',
        },
      })
    ).json();
    const byHand = (
      await app.inject({
        method: 'POST',
        url: '/api/schools',
        headers: as(admin()),
        payload: {
          name: `St Hand's C of E Primary ${tag}`,
          postcode: 'tt2 2bb',
        },
      })
    ).json();
    expect(withUrn.id).toBeTruthy();
    expect(byHand.id).toBeTruthy();

    const incoming = [
      school(1, { name: `New Name ${tag}`, provision: 'mainstream' }),
      school(2, {
        name: `St Hand’s CE Primary School ${tag}`,
        postcode: 'TT2 2BB',
      }),
      school(3, { section41: true, provision: 'specialist', ageTo: null }),
      school(3), // the same URN twice: the second is ignored
    ];

    const preview = await app.inject({
      method: 'POST',
      url: '/api/admin/import/schools/preview',
      headers: as(admin()),
      payload: { schools: incoming },
    });
    expect(preview.statusCode).toBe(200);
    const p = preview.json();
    expect(p).toMatchObject({ toCreate: 1, toUpdate: 2, repeated: 1 });
    expect(p.matchedByName).toHaveLength(1);
    expect(p.matchedByName[0]).toMatchObject({ id: byHand.id, urn: urn(2) });
    const refreshed = p.updates.find(
      (u: { id: string }) => u.id === withUrn.id,
    );
    expect(refreshed.changes.name).toEqual({
      from: `Old Name ${tag}`,
      to: `New Name ${tag}`,
    });
    // Provision set by staff is kept.
    expect(refreshed.changes.provision).toBeUndefined();
    // Nothing changed yet.
    const db = getDb();
    const [still] = await db
      .select({ name: schools.name })
      .from(schools)
      .where(eq(schools.id, withUrn.id));
    expect(still!.name).toBe(`Old Name ${tag}`);

    const done = await app.inject({
      method: 'POST',
      url: '/api/admin/import/schools',
      headers: as(admin()),
      payload: { schools: incoming },
    });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ created: 1, updated: 2 });

    const [a] = await db
      .select()
      .from(schools)
      .where(eq(schools.id, withUrn.id));
    expect(a).toMatchObject({
      name: `New Name ${tag}`,
      provision: 'specialist',
      notes: 'Kept as it is',
      localAuthority: 'Testshire',
      funding: 'academy',
    });
    const [b] = await db
      .select()
      .from(schools)
      .where(eq(schools.id, byHand.id));
    expect(b!.urn).toBe(urn(2));
    const [c] = await db
      .select()
      .from(schools)
      .where(eq(schools.urn, urn(3)));
    expect(c).toMatchObject({ section41: true, ageFrom: 4, ageTo: null });

    // Audited: the new school, each change and the import itself.
    const created = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.entityId, c!.id), eq(auditLog.action, 'school.create')),
      );
    expect(created).toHaveLength(1);
    const edits = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, withUrn.id),
          eq(auditLog.action, 'school.edit'),
        ),
      );
    expect(edits.at(-1)!.before).toMatchObject({ name: `Old Name ${tag}` });
    const summary = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, done.json().batchId));
    expect(summary[0]).toMatchObject({ action: 'school.import' });

    const again = await app.inject({
      method: 'POST',
      url: '/api/admin/import/schools',
      headers: as(admin()),
      payload: { schools: incoming },
    });
    expect(again.json()).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 3,
    });
    const [{ count }] = (await db.execute(
      sql`SELECT count(*)::int AS count FROM schools WHERE urn = ${urn(3)}`,
    )) as unknown as [{ count: number }];
    expect(count).toBe(1);
    await app.close();
  });
});
