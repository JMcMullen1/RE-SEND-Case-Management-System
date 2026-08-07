import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { KEY_DATE_TYPE_LABELS, buildICalendar, icalUid } from '@re-send/shared';
import { getDb } from '../db/client';
import { createCase } from './create-case';
import { createKeyDate } from './key-dates';
import {
  ensureIcalToken,
  listCalendarEvents,
  searchCasesForCalendar,
  userForIcalToken,
} from './calendar';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

async function seed(actor: string, work = 'Section Appeal') {
  const { caseId } = await createCase(
    {
      client: { fullName: 'Calendar Parent', consentDataProcessing: true },
      child: { fullName: 'Cal Child', preferredName: 'Cal' },
      case: { currentWork: work, appealLodged: true, ownerUserId: actor },
    },
    actor,
  );
  return caseId;
}

run('calendar repository', () => {
  it('lists events across cases with the case context and honours filters', async () => {
    const db = getDb();
    const [user] = (await db.execute(
      sql`SELECT id FROM users LIMIT 1`,
    )) as unknown as { id: string }[];
    const actor = user!.id;
    const caseId = await seed(actor);

    await createKeyDate(
      caseId,
      { date: '2026-06-08', time: '10:00', title: 'Hearing', type: 'hearing' },
      actor,
    );
    await createKeyDate(
      caseId,
      {
        date: '2026-05-01',
        title: 'Evidence deadline',
        type: 'evidence_deadline',
      },
      actor,
    );

    const mine = await listCalendarEvents({ scope: 'mine' }, actor);
    const forCase = mine.filter((e) => e.caseId === caseId);
    expect(forCase).toHaveLength(2);
    const hearing = forCase.find((e) => e.type === 'hearing')!;
    expect(hearing.caseReference).toMatch(/^RS-/);
    expect(hearing.childName).toBe('Cal'); // preferred name
    expect(hearing.time).toBe('10:00');
    expect(hearing.superseded).toBe(false);

    // Type filter narrows to one.
    const hearings = await listCalendarEvents(
      { scope: 'mine', types: ['hearing'] },
      actor,
    );
    expect(hearings.filter((e) => e.caseId === caseId)).toHaveLength(1);

    // Status filter: the seeded case is 'Enquiry' by default, so filtering to
    // 'Closed' excludes it.
    const closed = await listCalendarEvents(
      { scope: 'mine', statuses: ['Closed'] },
      actor,
    );
    expect(closed.filter((e) => e.caseId === caseId)).toHaveLength(0);

    // Date range excludes out-of-window dates.
    const juneOnly = await listCalendarEvents(
      { scope: 'mine', from: '2026-06-01', to: '2026-06-30' },
      actor,
    );
    expect(juneOnly.filter((e) => e.caseId === caseId)).toHaveLength(1);
  });

  it('hides superseded events unless history is requested', async () => {
    const db = getDb();
    const [user] = (await db.execute(
      sql`SELECT id FROM users LIMIT 1`,
    )) as unknown as { id: string }[];
    const actor = user!.id;
    const caseId = await seed(actor);
    const kd = await createKeyDate(
      caseId,
      { date: '2026-07-01', title: 'Old hearing', type: 'hearing' },
      actor,
    );
    await db.execute(
      sql`UPDATE key_dates SET superseded_at = now() WHERE id = ${kd.id}`,
    );

    const live = await listCalendarEvents({ scope: 'mine' }, actor);
    expect(live.some((e) => e.keyDateId === kd.id)).toBe(false);

    const withHistory = await listCalendarEvents(
      { scope: 'mine', includeSuperseded: true },
      actor,
    );
    const found = withHistory.find((e) => e.keyDateId === kd.id);
    expect(found?.superseded).toBe(true);
  });

  it('builds an iCal feed from a token, live events only', async () => {
    const db = getDb();
    const [user] = (await db.execute(
      sql`SELECT id, display_name FROM users LIMIT 1`,
    )) as unknown as { id: string; display_name: string }[];
    const actor = user!.id;
    const caseId = await seed(actor);
    const kd = await createKeyDate(
      caseId,
      {
        date: '2026-08-03',
        time: '09:30',
        title: 'Feed hearing',
        type: 'hearing',
      },
      actor,
    );

    const token = await ensureIcalToken(actor);
    expect(token).toBeTruthy();
    // The token is stable on a second call.
    expect(await ensureIcalToken(actor)).toBe(token);

    const resolved = await userForIcalToken(token!);
    expect(resolved?.id).toBe(actor);

    const events = await listCalendarEvents(
      { scope: 'user', userId: actor },
      actor,
    );
    const ics = buildICalendar(events, {
      calName: 'reSEND',
      now: new Date('2026-06-01T00:00:00Z'),
      typeLabels: KEY_DATE_TYPE_LABELS,
    });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain(icalUid(kd.id));
    expect(ics).toContain('DTSTART:20260803T093000');
  });

  it('searches cases for the add-date picker', async () => {
    const db = getDb();
    const [user] = (await db.execute(
      sql`SELECT id FROM users LIMIT 1`,
    )) as unknown as { id: string }[];
    const caseId = await seed(user!.id);
    const [ref] = (await db.execute(
      sql`SELECT case_reference FROM cases WHERE id = ${caseId}`,
    )) as unknown as { case_reference: string }[];

    const matches = await searchCasesForCalendar(ref!.case_reference);
    expect(matches.some((m) => m.id === caseId)).toBe(true);
    const byChild = await searchCasesForCalendar('Cal');
    expect(byChild.some((m) => m.id === caseId)).toBe(true);
  });
});
