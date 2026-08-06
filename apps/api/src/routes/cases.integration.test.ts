import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildServer } from '../server';
import { getDb } from '../db/client';

/**
 * Integration tests against a real, fixture-loaded database. Skipped unless
 * TEST_DATABASE_URL is set, so CI (which has no Postgres) stays green. Run with:
 *   DATABASE_URL=... TEST_DATABASE_URL=1 npx vitest run cases.integration
 */
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('case list API', () => {
  it('lists cases with totals and facet counts', async () => {
    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/api/cases' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Fixtures seed 20; other create tests may add more to the shared DB.
    expect(body.total).toBeGreaterThanOrEqual(20);
    expect(body.rows.length).toBeGreaterThan(0);
    expect(body.facetCounts.status).toBeTruthy();
    expect(body.facetCounts.team.TSA).toBeGreaterThan(0);
    await app.close();
  });

  it('includes both-team cases when filtering by one team', async () => {
    const app = await buildServer();
    // Cases genuinely sitting in BOTH teams, straight from the join table.
    const bothRows = await getDb().execute(
      sql`SELECT ct.case_id AS id FROM case_teams ct JOIN teams t ON t.id = ct.team_id GROUP BY ct.case_id HAVING count(*) FILTER (WHERE t.code IN ('TSA','ISA')) = 2`,
    );
    const bothIds = (bothRows as unknown as { id: string }[]).map((r) => r.id);
    expect(bothIds.length).toBeGreaterThan(0);

    const tsa = await app.inject({
      method: 'GET',
      url: '/api/cases?team=TSA&limit=200',
    });
    const isa = await app.inject({
      method: 'GET',
      url: '/api/cases?team=ISA&limit=200',
    });
    const tsaIds = new Set(tsa.json().rows.map((r: { id: string }) => r.id));
    const isaIds = new Set(isa.json().rows.map((r: { id: string }) => r.id));
    for (const id of bothIds) {
      expect(tsaIds.has(id)).toBe(true);
      expect(isaIds.has(id)).toBe(true);
    }
    await app.close();
  });

  it('searches across client, child, reference and notes', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/cases?q=Abernathy',
    });
    const body = res.json();
    expect(body.total).toBeGreaterThan(0);
    expect(body.total).toBeLessThan(20);
    await app.close();
  });

  it('reassigns an owner and writes an audit entry', async () => {
    const app = await buildServer();
    const list = await app.inject({ method: 'GET', url: '/api/cases?limit=1' });
    const caseId = list.json().rows[0].id as string;

    const before = await getDb().execute(
      sql`SELECT count(*)::int AS n FROM audit_log WHERE entity_id = ${caseId}`,
    );
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/cases/${caseId}/owner`,
      payload: { ownerQueue: 'Enquiries' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().row.owner).toEqual({ kind: 'queue', queue: 'Enquiries' });

    const after = await getDb().execute(
      sql`SELECT count(*)::int AS n FROM audit_log WHERE entity_id = ${caseId} AND action = 'case.reassign_owner'`,
    );
    expect(Number((after as unknown as { n: number }[])[0]!.n)).toBe(
      Number((before as unknown as { n: number }[])[0]!.n) + 1,
    );
    await app.close();
  });

  it('serves the seeded saved views', async () => {
    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/api/saved-views' });
    expect(res.json().seeds.length).toBe(7);
    await app.close();
  });
});
