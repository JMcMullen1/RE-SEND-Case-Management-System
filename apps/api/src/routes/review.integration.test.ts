import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildServer } from '../server';
import { getDb } from '../db/client';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('review mode API', () => {
  it('records a case review with reviewer and timestamp', async () => {
    const app = await buildServer();
    const users = (
      await app.inject({ method: 'GET', url: '/api/users' })
    ).json().users;
    const reviewer = users.find(
      (u: { role: string }) => u.role === 'caseworker',
    );
    const caseId = (
      await app.inject({ method: 'GET', url: '/api/cases?limit=1' })
    ).json().rows[0].id;

    const before = await getDb().execute(
      sql`SELECT count(*)::int AS n FROM case_reviews WHERE case_id = ${caseId}`,
    );

    const res = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/review`,
      headers: { 'x-user-id': reviewer.id },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().reviewedAt).toBeTruthy();

    const after = await getDb().execute(
      sql`SELECT reviewed_by_user_id, count(*)::int AS n FROM case_reviews WHERE case_id = ${caseId} GROUP BY reviewed_by_user_id`,
    );
    const rows = after as unknown as {
      reviewed_by_user_id: string;
      n: number;
    }[];
    expect(rows.some((r) => r.reviewed_by_user_id === reviewer.id)).toBe(true);
    const total = rows.reduce((s, r) => s + r.n, 0);
    expect(total).toBe(
      Number((before as unknown as { n: number }[])[0]!.n) + 1,
    );

    // The case now falls out of "not reviewed in the last day".
    const notReviewed = (
      await app.inject({
        method: 'GET',
        url: '/api/cases?notReviewedInDays=1&limit=200',
      })
    ).json();
    expect(notReviewed.rows.some((r: { id: string }) => r.id === caseId)).toBe(
      false,
    );

    await app.close();
  });
});
