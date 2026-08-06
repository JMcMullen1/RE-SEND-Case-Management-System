import { expect, test, type Route } from '@playwright/test';

// The agenda looks forward from today, so date the fixtures a few days ahead.
function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const events = [
  {
    keyDateId: 'k1',
    caseId: 'case-1',
    caseReference: 'RS-2026-1001',
    childName: 'Robin',
    title: 'Tribunal hearing',
    type: 'hearing',
    date: inDays(3),
    time: '10:00',
    status: 'Active',
    ownerUserId: 'u1',
    ownerName: 'Case Worker',
    teamCodes: [],
    superseded: false,
    sourceReference: null,
  },
  {
    keyDateId: 'k2',
    caseId: 'case-2',
    caseReference: 'RS-2026-1002',
    childName: 'Sky',
    title: 'Evidence deadline',
    type: 'evidence_deadline',
    date: inDays(5),
    time: null,
    status: 'Active',
    ownerUserId: 'u1',
    ownerName: 'Case Worker',
    teamCodes: [],
    superseded: false,
    sourceReference: 'Paragraph 3',
  },
];

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

test('calendar shows the agenda by default and opens an entry', async ({
  page,
}) => {
  await page.route('**/api/me', (r) =>
    json(r, {
      id: 'u1',
      displayName: 'Case Worker',
      role: 'caseworker',
      active: true,
    }),
  );
  await page.route('**/api/users', (r) =>
    json(r, {
      users: [
        {
          id: 'u1',
          displayName: 'Case Worker',
          role: 'caseworker',
          active: true,
        },
      ],
    }),
  );
  await page.route('**/api/bank-holidays', (r) =>
    json(r, { source: 'snapshot', events: [] }),
  );
  await page.route('**/api/calendar?*', (r) => json(r, { events }));

  await page.goto('/calendar');

  // Agenda is the default view.
  const agendaTab = page.getByRole('tab', { name: 'Agenda' });
  await expect(agendaTab).toHaveAttribute('aria-selected', 'true');

  // Both events are listed, colour-coded, with reference and child name.
  await expect(page.getByText('RS-2026-1001')).toBeVisible();
  await expect(page.getByText('Tribunal hearing')).toBeVisible();
  await expect(page.getByText('RS-2026-1002')).toBeVisible();

  // Switching to the month view shows the weekday grid.
  await page.getByRole('tab', { name: 'Month' }).click();
  await expect(page.getByRole('columnheader', { name: 'Mon' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Sun' })).toBeVisible();

  // Back to agenda; clicking an entry opens the details dialog with Open case.
  await page.getByRole('tab', { name: 'Agenda' }).click();
  await page
    .getByRole('button', { name: /Hearing: 10:00 RS-2026-1001/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Key date' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Open case' })).toHaveAttribute(
    'href',
    '/cases/case-1',
  );
});

test('the type filter is keyboard operable and narrows the calendar', async ({
  page,
}) => {
  const seen: string[] = [];
  await page.route('**/api/me', (r) =>
    json(r, { id: 'u1', displayName: 'CW', role: 'caseworker', active: true }),
  );
  await page.route('**/api/users', (r) => json(r, { users: [] }));
  await page.route('**/api/bank-holidays', (r) =>
    json(r, { source: 'snapshot', events: [] }),
  );
  await page.route('**/api/calendar?*', (r) => {
    seen.push(new URL(r.request().url()).search);
    const types = new URL(r.request().url()).searchParams.get('types');
    const filtered = types
      ? events.filter((e) => types.split(',').includes(e.type))
      : events;
    return json(r, { events: filtered });
  });

  await page.goto('/calendar');
  await expect(page.getByText('RS-2026-1002')).toBeVisible();

  // Toggle the "Hearing" type pill via keyboard focus + Enter.
  const pill = page.getByRole('button', { name: 'Hearing', exact: true });
  await pill.focus();
  await page.keyboard.press('Enter');
  await expect(pill).toHaveAttribute('aria-pressed', 'true');

  // The calendar re-queries with the type filter and drops the deadline case.
  await expect(page.getByText('RS-2026-1002')).toHaveCount(0);
  await expect(page.getByText('RS-2026-1001')).toBeVisible();
  expect(seen.some((s) => s.includes('types=hearing'))).toBe(true);
});
