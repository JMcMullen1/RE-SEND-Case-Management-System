import { describe, expect, it } from 'vitest';
import { buildServer } from '../server';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('calendar API', () => {
  it('serves events, a case search, and a token-authenticated iCal feed', async () => {
    const app = await buildServer();
    const userId = (await app.inject({ method: 'GET', url: '/api/me' })).json()
      .id as string;

    // Seed a case with a key date, owned by the acting user.
    const { caseId } = (
      await app.inject({
        method: 'POST',
        url: '/api/cases',
        headers: { 'x-user-id': userId },
        payload: {
          client: { fullName: 'Feed Parent' },
          child: { fullName: 'Feed Child', preferredName: 'Feedy' },
          case: { currentWork: 'Section Appeal', ownerUserId: userId },
        },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/key-dates`,
      headers: { 'x-user-id': userId },
      payload: {
        date: '2026-09-14',
        time: '11:00',
        title: 'API hearing',
        type: 'hearing',
      },
    });

    // The calendar lists it.
    const events = (
      await app.inject({
        method: 'GET',
        url: '/api/calendar?scope=mine',
        headers: { 'x-user-id': userId },
      })
    ).json().events as { caseId: string; title: string }[];
    expect(
      events.some((e) => e.caseId === caseId && e.title === 'API hearing'),
    ).toBe(true);

    // The case search finds the case.
    const search = (
      await app.inject({
        method: 'GET',
        url: '/api/calendar/case-search?q=Feedy',
        headers: { 'x-user-id': userId },
      })
    ).json().cases as { id: string }[];
    expect(search.some((c) => c.id === caseId)).toBe(true);

    // The feed URL is issued, and the feed it points to is a valid calendar.
    const feed = (
      await app.inject({
        method: 'GET',
        url: '/api/calendar/feed-url',
        headers: { 'x-user-id': userId },
      })
    ).json() as { path: string | null };
    expect(feed.path).toMatch(/^\/api\/calendar\/feed\/.+\.ics$/);

    const ics = await app.inject({ method: 'GET', url: feed.path! });
    expect(ics.statusCode).toBe(200);
    expect(ics.headers['content-type']).toContain('text/calendar');
    expect(ics.body).toContain('BEGIN:VCALENDAR');
    expect(ics.body).toContain('API hearing');

    // An unknown token is rejected.
    const bad = await app.inject({
      method: 'GET',
      url: '/api/calendar/feed/not-a-real-token.ics',
    });
    expect(bad.statusCode).toBe(404);

    // Bank holidays are available for the working-day-aware picker.
    const holidays = (
      await app.inject({ method: 'GET', url: '/api/bank-holidays' })
    ).json() as { events: { date: string }[] };
    expect(holidays.events.length).toBeGreaterThan(0);

    await app.close();
  });
});
