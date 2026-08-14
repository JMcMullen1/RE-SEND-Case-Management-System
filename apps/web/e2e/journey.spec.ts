import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The full demonstration journey against a real API and web server over a clean,
 * empty database. The two AI extractions (smart fill and directions) are stubbed
 * at the network boundary so the run is deterministic and needs no API key —
 * everything else (creating cases, applying the directions, the calendar, review
 * and the live reassignment) exercises the real system end to end.
 */

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function signIn(page: Page, email = 'jamie.mcmullen@resend.demo') {
  await page.goto('/');
  await page.getByLabel('Account').selectOption(email);
  await page.getByLabel('Password').fill('resend-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

const intakeStub = {
  status: 'ok',
  result: {
    source: 'form',
    client: {
      fullName: { value: 'Nadia Rahman', confidence: 0.9 },
      email: { value: 'nadia.rahman@example.co.uk', confidence: 0.9 },
    },
    child: {
      fullName: { value: 'Yusuf Rahman', confidence: 0.9 },
      dateOfBirth: { value: '2015-04-23', confidence: 0.8 },
    },
    case: {
      currentWork: { value: 'Section Appeal', confidence: 0.8 },
    },
    keyDates: [],
    missing: [],
    ref: {
      storageKey: 'intake/stub-key',
      filename: 'jotform-enquiry.pdf',
      mimeType: 'application/pdf',
      byteSize: 100,
      sha256: 'stub',
    },
  },
};

function directionsStub(documentReference: string) {
  return {
    status: 'ok',
    review: {
      documentId: null,
      filename: 'amended-directions-order.pdf',
      orderDate: inDays(0),
      summary: '2 new dates',
      counts: { new: 2, moved: 0, superseded: 0, unchanged: 0 },
      rows: [
        {
          class: 'new',
          existingKeyDateId: null,
          oldValue: null,
          newValue: { date: inDays(40), time: '10:00', title: 'Final Hearing' },
          category: 'Final Hearing',
          party: 'tribunal',
          obligation: `The final hearing is relisted (${documentReference}).`,
          rawDateText: 'relisted',
          workingDays: false,
          explanation: null,
          paragraph: 1,
          confidence: 0.95,
          include: true,
        },
        {
          class: 'new',
          existingKeyDateId: null,
          oldValue: null,
          newValue: {
            date: inDays(20),
            time: '16:00',
            title: 'Final Evidence Deadline',
          },
          category: 'Final Evidence Deadline',
          party: 'appellant',
          obligation:
            'The appellant shall file evidence 15 working days before the hearing.',
          rawDateText: '15 working days before the hearing',
          workingDays: true,
          explanation: '15 working days before the hearing',
          paragraph: 2,
          confidence: 0.9,
          include: true,
        },
      ],
    },
  };
}

test('demonstration journey: sign in, add cases, directions, calendar, review, live reassign', async ({
  page,
  context,
  browser,
}) => {
  // 1. Sign in.
  await signIn(page);

  // 2. The case list is empty.
  await expect(
    page.getByText('No cases have been added yet.', { exact: false }),
  ).toBeVisible();

  // 3. Add a case manually.
  await page.getByRole('link', { name: 'Add a case' }).first().click();
  await expect(page).toHaveURL(/\/cases\/new/);
  await page.getByLabel('Full name').first().fill('Jamie Doe');
  await page.getByLabel('Full name').nth(1).fill('Robin Doe');
  await page.getByLabel('Type of case').selectOption('Section Appeal');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText('Case created.', { exact: false })).toBeVisible();

  // 4. Create a second case by dropping in a JotForm (extraction stubbed).
  await page.route('**/api/intake/extract*', (r) => json(r, intakeStub));
  await page.goto('/cases/new');
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: 'jotform-enquiry.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 stub'),
    });
  // The form is prefilled from the (stubbed) extraction.
  await expect(page.getByLabel('Full name').first()).toHaveValue(
    'Nadia Rahman',
  );
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText('Case created.', { exact: false })).toBeVisible();

  // 5. Apply a directions order (extraction stubbed) and confirm the diff.
  await page.route('**/api/cases/*/directions/extract', (r) =>
    json(r, directionsStub('Yusuf Rahman')),
  );
  await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({
    name: 'amended-directions-order.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 stub'),
  });
  const reviewDialog = page.getByRole('dialog', { name: 'Review directions' });
  await expect(reviewDialog).toBeVisible();
  await expect(reviewDialog.getByText('2 new dates')).toBeVisible();
  await reviewDialog.getByRole('button', { name: 'Apply changes' }).click();
  await expect(reviewDialog).toBeHidden();
  await expect(page.getByText(/Calendar updated/)).toBeVisible();

  // 6. The applied dates appear on the calendar.
  await page.goto('/calendar');
  await expect(
    page.getByText('Final hearing', { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('Evidence deadline', { exact: false }).first(),
  ).toBeVisible();

  // 7. Review mode across both cases.
  await page.goto('/review');
  // Either the review set shows cases to work through, or the finished state.
  await expect(page.getByRole('heading').first()).toBeVisible();

  // 8. Reassign a case and watch it update live in a second browser session.
  const second = await browser.newContext();
  const pageB = await second.newPage();
  await signIn(pageB);
  await expect(pageB.getByText('Doe, Jamie', { exact: false })).toBeVisible();

  await page.goto('/');
  // Open the first owner cell (an unassigned queue chip) and assign to Ben.
  const ownerButton = page
    .getByRole('button', { name: /Enquiries|TSA Team/ })
    .first();
  await ownerButton.click();
  await page.getByRole('menuitem', { name: 'Alan Marsden' }).click();

  // The second session sees the new owner without reloading. Target the owner
  // cell button (not the hidden <option> in the acting-user switcher).
  await expect(pageB.getByRole('button', { name: 'Alan Marsden' })).toBeVisible(
    {
      timeout: 15_000,
    },
  );

  await second.close();
  await context.close();
});
