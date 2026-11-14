import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { buildServer } from '../server';
import { caseCorpus } from '../corpus/case-corpus';
import { invalidateCorpus } from '../corpus/cache';
import type { UserSummary } from '../repositories/users';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('schools directory API', () => {
  let caseId = '';
  let users: UserSummary[] = [];
  const stamp = Date.now();
  // Six digits, unique per run.
  const urn = String(100000 + (stamp % 900000));
  const admin = () => users.find((u) => u.role === 'admin')!;
  const worker = () => users.find((u) => u.role === 'caseworker')!;
  const readOnly = () => users.find((u) => u.role === 'read_only')!;
  const as = (u: UserSummary) => ({ 'x-user-id': u.id });
  let schoolId = '';

  beforeAll(async () => {
    const app = await buildServer();
    users = (await app.inject({ method: 'GET', url: '/api/users' })).json()
      .users;
    caseId = (
      await app.inject({ method: 'GET', url: '/api/cases?limit=1' })
    ).json().rows[0].id;
    await app.close();
  });

  it('adds a school, warns about a likely duplicate, and refuses a reused URN', async () => {
    const app = await buildServer();
    const created = await app.inject({
      method: 'POST',
      url: '/api/schools',
      headers: as(worker()),
      payload: {
        name: `St Mary's C of E Primary School ${stamp}`,
        urn,
        postcode: 'al1 2ab',
        funding: 'academy',
        provision: 'mainstream',
        ageFrom: 4,
        ageTo: 11,
      },
    });
    expect(created.statusCode).toBe(200);
    schoolId = created.json().id;
    expect(created.json().postcode).toBe('AL1 2AB');

    // Same school written differently → a duplicate warning with the match.
    const dupe = await app.inject({
      method: 'POST',
      url: '/api/schools',
      headers: as(worker()),
      payload: { name: `St Marys CE Primary ${stamp}`, postcode: 'AL12AB' },
    });
    expect(dupe.statusCode).toBe(409);
    expect(dupe.json().duplicates[0].id).toBe(schoolId);

    // A reused URN is refused even when forced.
    const sameUrn = await app.inject({
      method: 'POST',
      url: '/api/schools?force=true',
      headers: as(worker()),
      payload: { name: `Somewhere Else ${stamp}`, urn },
    });
    expect(sameUrn.statusCode).toBe(409);

    // Bad input is refused.
    const bad = await app.inject({
      method: 'POST',
      url: '/api/schools',
      headers: as(worker()),
      payload: { name: `Bad ages ${stamp}`, ageFrom: 11, ageTo: 4 },
    });
    expect(bad.statusCode).toBe(400);

    // Read-only users cannot change the directory.
    const ro = await app.inject({
      method: 'POST',
      url: '/api/schools',
      headers: as(readOnly()),
      payload: { name: `Read only ${stamp}` },
    });
    expect(ro.statusCode).toBe(403);
    await app.close();
  });

  it('searches and filters the directory', async () => {
    const app = await buildServer();
    const byName = (
      await app.inject({
        method: 'GET',
        url: `/api/schools?q=${encodeURIComponent(`saint marys ${stamp}`)}`,
      })
    ).json().schools as { id: string }[];
    expect(byName.some((s) => s.id === schoolId)).toBe(true);
    const byUrn = (
      await app.inject({ method: 'GET', url: `/api/schools?q=${urn}` })
    ).json().schools as { id: string }[];
    expect(byUrn.map((s) => s.id)).toEqual([schoolId]);
    const s41 = (
      await app.inject({
        method: 'GET',
        url: `/api/schools?q=${urn}&section41=true`,
      })
    ).json().schools;
    expect(s41).toHaveLength(0);
    await app.close();
  });

  it('manages contacts and links the school to a case, keeping the child in step', async () => {
    const app = await buildServer();
    const senco = (
      await app.inject({
        method: 'POST',
        url: `/api/schools/${schoolId}/contacts`,
        headers: as(worker()),
        payload: {
          name: 'Ms Example',
          role: 'SENCo',
          email: 'senco@school.example',
        },
      })
    ).json();
    expect(senco.role).toBe('SENCo');

    const linked = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/schools`,
      headers: as(worker()),
      payload: { schoolId, role: 'current' },
    });
    expect(linked.statusCode).toBe(200);
    const link = linked
      .json()
      .schools.find(
        (l: { school: { id: string } }) => l.school.id === schoolId,
      );
    expect(link.contacts.map((c: { id: string }) => c.id)).toContain(senco.id);

    // The child's "Current school" now names the directory school.
    const detail = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/detail` })
    ).json();
    expect(detail.child.currentSchoolName).toBe(
      `St Mary's C of E Primary School ${stamp}`,
    );

    // Mark the SENCo as involved; the corpus case record names the school and her.
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/cases/${caseId}/schools/${link.linkId}`,
      headers: as(worker()),
      payload: { contactIds: [senco.id] },
    });
    expect(
      updated
        .json()
        .schools.find((l: { linkId: string }) => l.linkId === link.linkId)
        .involvedContactIds,
    ).toEqual([senco.id]);
    invalidateCorpus(caseId);
    const corpus = await caseCorpus(caseId, { include: ['case_record'] });
    expect(corpus.items[0]!.text).toContain(
      `Current school: St Mary's C of E Primary School ${stamp}`,
    );
    expect(corpus.items[0]!.text).toContain('Contact: Ms Example, SENCo');

    // The school page lists the case.
    const school = (
      await app.inject({ method: 'GET', url: `/api/schools/${schoolId}` })
    ).json();
    expect(
      school.cases.some((c: { caseId: string }) => c.caseId === caseId),
    ).toBe(true);
    expect(school.caseCount).toBeGreaterThanOrEqual(1);

    // Removing the contact drops it from the case link too.
    await app.inject({
      method: 'DELETE',
      url: `/api/school-contacts/${senco.id}`,
      headers: as(worker()),
    });
    const after = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/schools` })
    ).json();
    const l2 = after.schools.find(
      (l: { linkId: string }) => l.linkId === link.linkId,
    );
    expect(l2.involvedContactIds).toEqual([]);
    expect(l2.contacts).toHaveLength(0);

    // Unlink, audited.
    const un = await app.inject({
      method: 'DELETE',
      url: `/api/cases/${caseId}/schools/${link.linkId}`,
      headers: as(worker()),
    });
    expect(un.statusCode).toBe(200);
    const [audit] = (await getDb().execute(
      sql`SELECT count(*)::int AS n FROM audit_log
          WHERE entity_id = ${link.linkId}
            AND action IN ('case_school.link','case_school.edit','case_school.unlink')`,
    )) as unknown as { n: number }[];
    // Linked, contacts ticked, contact removed from the link, unlinked.
    expect(audit!.n).toBe(4);
    await app.close();
  });

  it('lets only an admin archive a school, and hides it from search', async () => {
    const app = await buildServer();
    const denied = await app.inject({
      method: 'POST',
      url: `/api/schools/${schoolId}/archive`,
      headers: as(worker()),
      payload: { archived: true },
    });
    expect(denied.statusCode).toBe(403);
    const ok = await app.inject({
      method: 'POST',
      url: `/api/schools/${schoolId}/archive`,
      headers: as(admin()),
      payload: { archived: true },
    });
    expect(ok.json().archived).toBe(true);
    const found = (
      await app.inject({ method: 'GET', url: `/api/schools?q=${urn}` })
    ).json().schools;
    expect(found).toHaveLength(0);
    const withArchived = (
      await app.inject({
        method: 'GET',
        url: `/api/schools?q=${urn}&archived=true`,
      })
    ).json().schools;
    expect(withArchived).toHaveLength(1);
    await app.close();
  });

  it("keeps the child's school fields in step as links change, and follows renames", async () => {
    const app = await buildServer();
    const add = async (name: string, extra: Record<string, unknown> = {}) =>
      (
        await app.inject({
          method: 'POST',
          url: '/api/schools?force=true',
          headers: as(worker()),
          payload: { name, ...extra },
        })
      ).json() as { id: string };
    const a = await add(`Alder ${stamp}`, {
      address: '1 Alder Road',
      postcode: 'AL1 1AA',
    });
    const b = await add(`Birch ${stamp}`);
    // A fresh case so earlier links do not interfere.
    const kase = (
      await app.inject({
        method: 'POST',
        url: '/api/cases',
        headers: as(worker()),
        payload: {
          client: { fullName: 'Sync Parent' },
          child: { fullName: 'Sync Child' },
          case: { currentWork: 'Section Appeal' },
        },
      })
    ).json().caseId as string;
    const child = async () =>
      (
        await app.inject({ method: 'GET', url: `/api/cases/${kase}/detail` })
      ).json().child as {
        currentSchoolName: string | null;
        currentSchoolAddress: string | null;
        desiredSchool: string | null;
      };
    const link = async (schoolId: string, role: string) =>
      (
        await app.inject({
          method: 'POST',
          url: `/api/cases/${kase}/schools`,
          headers: as(worker()),
          payload: { schoolId, role },
        })
      ).json().schools as {
        linkId: string;
        role: string;
        school: { id: string };
      }[];

    // Current school brings its name and address.
    await link(a.id, 'current');
    expect(await child()).toMatchObject({
      currentSchoolName: `Alder ${stamp}`,
      currentSchoolAddress: '1 Alder Road, AL1 1AA',
    });

    // Renaming the school follows through to the child.
    await app.inject({
      method: 'PATCH',
      url: `/api/schools/${a.id}`,
      headers: as(worker()),
      payload: { name: `Alder Park ${stamp}` },
    });
    expect((await child()).currentSchoolName).toBe(`Alder Park ${stamp}`);

    // A new current school moves the old one to "previous".
    const links = await link(b.id, 'current');
    expect(links.find((l) => l.school.id === a.id)?.role).toBe('previous');
    expect(await child()).toMatchObject({
      currentSchoolName: `Birch ${stamp}`,
      currentSchoolAddress: null,
    });

    // Moving Birch from current to proposed: current is now empty, desired is Birch.
    const birch = links.find((l) => l.school.id === b.id)!;
    await app.inject({
      method: 'PATCH',
      url: `/api/cases/${kase}/schools/${birch.linkId}`,
      headers: as(worker()),
      payload: { role: 'proposed' },
    });
    expect(await child()).toMatchObject({
      currentSchoolName: null,
      desiredSchool: `Birch ${stamp}`,
    });

    // Unlinking clears the desired school it set...
    await app.inject({
      method: 'DELETE',
      url: `/api/cases/${kase}/schools/${birch.linkId}`,
      headers: as(worker()),
    });
    expect((await child()).desiredSchool).toBeNull();

    // ...but never text someone typed for a different school.
    const [row] = (await getDb().execute(
      sql`SELECT child_id FROM cases WHERE id = ${kase}`,
    )) as unknown as { child_id: string }[];
    await app.inject({
      method: 'PATCH',
      url: `/api/children/${row!.child_id}`,
      headers: as(worker()),
      payload: { desiredSchool: 'A school typed by hand' },
    });
    const again = await link(b.id, 'proposed');
    expect((await child()).desiredSchool).toBe(`Birch ${stamp}`);
    await app.inject({
      method: 'DELETE',
      url: `/api/cases/${kase}/schools/${
        again.find((l) => l.school.id === b.id && l.role === 'proposed')!.linkId
      }`,
      headers: as(worker()),
    });
    expect((await child()).desiredSchool).toBeNull();
    await app.close();
  });

  it('handles URNs: spaces, archived schools, and a clash on restore', async () => {
    const app = await buildServer();
    const urn2 = String(200000 + (stamp % 700000));
    const spaced = await app.inject({
      method: 'POST',
      url: '/api/schools',
      headers: as(worker()),
      payload: {
        name: `Cedar ${stamp}`,
        urn: `${urn2.slice(0, 3)} ${urn2.slice(3)}`,
      },
    });
    expect(spaced.statusCode).toBe(200);
    expect(spaced.json().urn).toBe(urn2);
    const cedar = spaced.json().id as string;

    await app.inject({
      method: 'POST',
      url: `/api/schools/${cedar}/archive`,
      headers: as(admin()),
      payload: { archived: true },
    });
    // With the URN's school archived, a new record may use it (forced past
    // the archived match).
    const reuse = await app.inject({
      method: 'POST',
      url: '/api/schools?force=true',
      headers: as(worker()),
      payload: { name: `Cedar Two ${stamp}`, urn: urn2 },
    });
    expect(reuse.statusCode).toBe(200);
    // Restoring the archived one now clashes: a clear 409, not a 500.
    const restore = await app.inject({
      method: 'POST',
      url: `/api/schools/${cedar}/archive`,
      headers: as(admin()),
      payload: { archived: false },
    });
    expect(restore.statusCode).toBe(409);
    expect(restore.json().message).toMatch(/URN/);
    await app.close();
  });
});
