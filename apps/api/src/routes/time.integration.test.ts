import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { londonToday } from '@re-send/shared';
import { getDb } from '../db/client';
import { buildServer } from '../server';
import type { UserSummary } from '../repositories/users';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('time recording API', () => {
  let caseId = '';
  let users: UserSummary[] = [];
  const today = londonToday(new Date());
  const admin = () => users.find((u) => u.role === 'admin')!;
  const workers = () => users.filter((u) => u.role === 'caseworker');
  const as = (u: UserSummary) => ({ 'x-user-id': u.id });

  beforeAll(async () => {
    const app = await buildServer();
    users = (await app.inject({ method: 'GET', url: '/api/users' })).json()
      .users;
    caseId = (
      await app.inject({ method: 'GET', url: '/api/cases?limit=1' })
    ).json().rows[0].id;
    await app.close();
  });

  it('requires a time on a billable, rounds it up, and refuses one on a note', async () => {
    const app = await buildServer();
    const worker = workers()[0]!;
    const missing = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/notes`,
      headers: as(worker),
      payload: { body: 'Phone call with parent', kind: 'billable' },
    });
    expect(missing.statusCode).toBe(400);

    const onNote = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/notes`,
      headers: as(worker),
      payload: { body: 'A plain note', kind: 'note', minutes: 30 },
    });
    expect(onNote.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/notes`,
      headers: as(worker),
      payload: {
        body: 'Drafted appeal grounds',
        kind: 'billable',
        minutes: 50,
      },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().item.minutes).toBe(60);

    const timeline = (
      await app.inject({
        method: 'GET',
        url: `/api/cases/${caseId}/timeline?kind=billable`,
        headers: as(worker),
      })
    ).json().items as { id: string; minutes: number | null }[];
    expect(timeline.find((i) => i.id === ok.json().item.id)?.minutes).toBe(60);
    await app.close();
  });

  it('lets the author or an admin change the time, but nobody else', async () => {
    const app = await buildServer();
    const [author, other] = workers();
    const created = (
      await app.inject({
        method: 'POST',
        url: `/api/cases/${caseId}/notes`,
        headers: as(author!),
        payload: { body: 'Reviewed bundle', kind: 'billable', minutes: 15 },
      })
    ).json().item;

    const byOther = await app.inject({
      method: 'PATCH',
      url: `/api/notes/${created.id}`,
      headers: as(other!),
      payload: { minutes: 90 },
    });
    expect(byOther.statusCode).toBe(403);

    const byAuthor = await app.inject({
      method: 'PATCH',
      url: `/api/notes/${created.id}`,
      headers: as(author!),
      payload: { minutes: 40 },
    });
    expect(byAuthor.json().item.minutes).toBe(45);

    const byAdmin = await app.inject({
      method: 'PATCH',
      url: `/api/notes/${created.id}`,
      headers: as(admin()),
      payload: { minutes: 30, body: 'Reviewed bundle (corrected)' },
    });
    expect(byAdmin.json().item.minutes).toBe(30);
    expect(byAdmin.json().item.body).toBe('Reviewed bundle (corrected)');

    const [audit] = (await getDb().execute(
      sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'time.edit'
          AND entity_id IN (SELECT id FROM time_entries WHERE note_id = ${created.id})`,
    )) as unknown as { n: number }[];
    expect(audit!.n).toBe(2);
    await app.close();
  });

  it('flags a billable written before time recording, and records time on it', async () => {
    const app = await buildServer();
    const author = workers()[0]!;
    const [legacy] = (await getDb().execute(
      sql`INSERT INTO case_notes (case_id, author_user_id, entry_date, body, kind)
          VALUES (${caseId}, ${author.id}, current_date, 'Old billable', 'billable')
          RETURNING id`,
    )) as unknown as { id: string }[];

    const before = (
      await app.inject({
        method: 'GET',
        url: `/api/cases/${caseId}/time-summary`,
      })
    ).json();
    expect(before.missingTimeCount).toBeGreaterThanOrEqual(1);

    const mine = (
      await app.inject({
        method: 'GET',
        url: `/api/time?from=${today}&to=${today}`,
        headers: as(author),
      })
    ).json();
    expect(
      mine.missingTime.some((m: { noteId: string }) => m.noteId === legacy!.id),
    ).toBe(true);

    const fixed = await app.inject({
      method: 'PATCH',
      url: `/api/notes/${legacy!.id}`,
      headers: as(author),
      payload: { minutes: 20 },
    });
    expect(fixed.json().item.minutes).toBe(30);

    const after = (
      await app.inject({
        method: 'GET',
        url: `/api/cases/${caseId}/time-summary`,
      })
    ).json();
    expect(after.missingTimeCount).toBe(before.missingTimeCount - 1);
    await app.close();
  });

  it('deletes a billable with its time (audited)', async () => {
    const app = await buildServer();
    const author = workers()[0]!;
    const summary = async () =>
      (
        await app.inject({
          method: 'GET',
          url: `/api/cases/${caseId}/time-summary`,
        })
      ).json().totalMinutes as number;
    const created = (
      await app.inject({
        method: 'POST',
        url: `/api/cases/${caseId}/notes`,
        headers: as(author),
        payload: { body: 'Wrong case', kind: 'billable', minutes: 120 },
      })
    ).json().item;
    const total = await summary();

    const forbidden = await app.inject({
      method: 'DELETE',
      url: `/api/notes/${created.id}`,
      headers: as(workers()[1]!),
    });
    expect(forbidden.statusCode).toBe(403);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/notes/${created.id}`,
      headers: as(author),
    });
    expect(res.statusCode).toBe(200);
    expect(await summary()).toBe(total - 120);

    const [audit] = (await getDb().execute(
      sql`SELECT count(*)::int AS n FROM audit_log
          WHERE action IN ('note.delete', 'time.delete')
            AND (entity_id = ${created.id} OR entity_id IN
              (SELECT id FROM time_entries WHERE note_id = ${created.id}))`,
    )) as unknown as { n: number }[];
    expect(audit!.n).toBe(2);
    await app.close();
  });

  it('shows earnings at the rate in force on the day, to the person and admins only', async () => {
    const app = await buildServer();
    const [worker, other] = workers();

    // Non-admins cannot read or set rates, or read someone else's time.
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/admin/rates',
          headers: as(worker!),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/rates',
          headers: as(worker!),
          payload: {
            userId: worker!.id,
            kind: 'pay',
            ratePence: 99999,
            effectiveFrom: '2000-01-01',
          },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/time?from=${today}&to=${today}&userId=${other!.id}`,
          headers: as(worker!),
        })
      ).statusCode,
    ).toBe(403);

    // An admin sets a pay rate from long ago and a higher one from tomorrow:
    // today's work is earned at the earlier one.
    const tomorrow = new Date(`${today}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    for (const [ratePence, effectiveFrom] of [
      [2000, '2000-01-01'],
      [5000, tomorrow.toISOString().slice(0, 10)],
    ] as const) {
      const set = await app.inject({
        method: 'POST',
        url: '/api/admin/rates',
        headers: as(admin()),
        payload: { userId: worker!.id, kind: 'pay', ratePence, effectiveFrom },
      });
      expect(set.statusCode).toBe(200);
    }
    const rates = (
      await app.inject({
        method: 'GET',
        url: '/api/admin/rates',
        headers: as(admin()),
      })
    ).json().staff as { userId: string; pay: { ratePence: number } | null }[];
    expect(rates.find((r) => r.userId === worker!.id)?.pay?.ratePence).toBe(
      2000,
    );

    const note = (
      await app.inject({
        method: 'POST',
        url: `/api/cases/${caseId}/notes`,
        headers: as(worker!),
        payload: { body: 'Tribunal prep', kind: 'billable', minutes: 45 },
      })
    ).json().item;

    for (const viewer of [worker!, admin()]) {
      const report = (
        await app.inject({
          method: 'GET',
          url: `/api/time?from=${today}&to=${today}&userId=${worker!.id}`,
          headers: as(viewer),
        })
      ).json();
      const entry = report.entries.find(
        (e: { noteId: string }) => e.noteId === note.id,
      );
      expect(entry.minutes).toBe(45);
      expect(entry.earningsPence).toBe(1500);
      expect(entry.narrative).toBe('Tribunal prep');
      expect(report.totalEarningsPence).toBeGreaterThanOrEqual(1500);
    }
    await app.close();
  });
});
