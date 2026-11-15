import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The case history, against the real API over the e2e database: a made-up
 * case's note, document and filed email read in one chronological list.
 */
async function signIn(page: Page, email = 'jamie.mcmullen@resend.demo') {
  await page.goto('/');
  await page.getByLabel('Account').selectOption(email);
  await page.getByLabel('Password').fill('resend-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d;
}

const eml = [
  'From: Made Up Officer <officer@la.example>',
  'To: parent@example.org',
  'Subject: Final EHC plan issued',
  `Date: ${daysAgo(2).toUTCString()}`,
  'Message-ID: <history-e2e@la.example>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="b1"',
  '',
  '--b1',
  'Content-Type: text/plain; charset=utf-8',
  '',
  ...Array.from({ length: 10 }, (_, i) => `Line ${i + 1} of the letter.`),
  'The final line mentions occupational therapy.',
  '--b1',
  'Content-Type: text/plain; name="final-plan.txt"',
  'Content-Disposition: attachment; filename="final-plan.txt"',
  '',
  'The final plan.',
  '--b1--',
  '',
].join('\r\n');

test('a case reads start to finish: notes, emails and documents together', async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.getByRole('link', { name: 'Search documents' }),
  ).toBeVisible();
  const { caseId } = await (
    await page.request.post('/api/cases', {
      data: {
        client: { fullName: 'History Parent' },
        child: { fullName: 'History Child' },
        case: { currentWork: 'Section Appeal' },
      },
    })
  ).json();
  const noted = await page.request.post(`/api/cases/${caseId}/notes`, {
    data: {
      body: 'Parent called about the draft plan.',
      entryDate: daysAgo(3).toISOString().slice(0, 10),
    },
  });
  expect(noted.ok(), await noted.text()).toBe(true);
  const filed = await page.request.post(`/api/cases/${caseId}/emails`, {
    multipart: {
      file: {
        name: 'final-plan.eml',
        mimeType: 'message/rfc822',
        buffer: Buffer.from(eml),
      },
    },
  });
  expect(filed.ok(), await filed.text()).toBe(true);
  expect(
    (
      await page.request.post(
        `/api/cases/${caseId}/documents?category=Expert%20Report`,
        {
          multipart: {
            file: {
              name: 'ep-report.txt',
              mimeType: 'text/plain',
              buffer: Buffer.from('EP report'),
            },
          },
        },
      )
    ).ok(),
  ).toBe(true);

  await page.goto(`/cases/${caseId}?tab=history`);
  await expect(page.getByRole('tab', { name: 'History' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('3 entries.')).toBeVisible();
  // Oldest first reads the case in order: the note, then the email.
  await page.getByLabel('Order').selectOption('oldest');
  const items = page.locator('ol ol > li');
  await expect(items.nth(0)).toContainText(
    'Parent called about the draft plan.',
  );
  await expect(items.nth(1)).toContainText('Final EHC plan issued');
  // The attachment sits with its email, not again on its own.
  await expect(items.nth(1)).toContainText('final-plan.txt');
  await expect(page.getByText('final-plan.txt')).toHaveCount(1);

  // A long email opens in full on request.
  await expect(page.getByText(/occupational therapy/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Show the whole email' }).click();
  await expect(page.getByText(/occupational therapy/)).toBeVisible();
  await page.screenshot({ path: 'test-results/history.png', fullPage: true });

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map(
        (v) =>
          `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 120)).join(' | ')}`,
      ),
  ).toEqual([]);

  // Filters and find.
  await page.getByRole('button', { name: 'Emails' }).click();
  await expect(page.getByText('1 of 3 entries shown.')).toBeVisible();
  await page.getByRole('button', { name: 'Emails' }).click();
  await page.getByLabel('Find in this case’s history').fill('ep-report');
  await expect(page.getByText('1 of 3 entries shown.')).toBeVisible();
  await expect(
    page.getByRole('link', { name: /ep-report\.txt/ }),
  ).toBeVisible();
});
