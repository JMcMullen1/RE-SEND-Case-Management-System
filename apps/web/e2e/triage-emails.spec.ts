import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Emails to file, against the real API over the clean e2e database: two
 * made-up emails are dropped in without choosing a case. The one from the
 * client of a case is filed to it by itself; the other waits in the list, is
 * read, and is filed to a case found by searching.
 */
async function signIn(page: Page, email = 'jamie.mcmullen@resend.demo') {
  await page.goto('/');
  await page.getByLabel('Account').selectOption(email);
  await page.getByLabel('Password').fill('resend-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

function eml(opts: {
  id: string;
  from: string;
  subject: string;
  body: string;
}) {
  return Buffer.from(
    [
      `From: ${opts.from}`,
      'To: Casework <jamie.mcmullen@resend.demo>',
      `Subject: ${opts.subject}`,
      'Date: Sat, 14 Nov 2026 10:00:00 +0000',
      `Message-ID: <${opts.id}@example.org>`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      opts.body,
      '',
    ].join('\r\n'),
  );
}

test('emails dropped in are filed to their case, or wait for someone to choose', async ({
  page,
}) => {
  const stamp = Date.now();
  await signIn(page);
  await expect(
    page.getByRole('banner').getByRole('link', { name: /^Emails/ }),
  ).toBeVisible();

  // A made-up family, with the client's email address on the case.
  const created = await page.request.post('/api/cases', {
    data: {
      client: {
        fullName: `Triage Parent ${stamp}`,
        email: `triage.parent.${stamp}@example.org`,
      },
      child: { fullName: `Wren Triage${stamp}` },
      case: { currentWork: 'Section Appeal' },
    },
  });
  const { caseReference } = await created.json();

  await page
    .getByRole('banner')
    .getByRole('link', { name: /^Emails/ })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Emails to file' }),
  ).toBeVisible();
  await page.getByLabel('Emails to file').setInputFiles([
    {
      name: 'from-parent.eml',
      mimeType: 'message/rfc822',
      buffer: eml({
        id: `parent-${stamp}`,
        from: `Triage Parent <triage.parent.${stamp}@example.org>`,
        subject: 'Our question',
        body: 'Hello, a question about the hearing.',
      }),
    },
    {
      name: 'unknown.eml',
      mimeType: 'message/rfc822',
      buffer: eml({
        id: `unknown-${stamp}`,
        from: `Unknown Sender <unknown.${stamp}@example.org>`,
        subject: `Unplaced ${stamp}`,
        body: 'A letter about something.',
      }),
    },
  ]);

  await expect(
    page.getByText(
      `Filed to ${caseReference} — matched by the client’s email address.`,
    ),
  ).toBeVisible();
  await expect(
    page.getByText('No case matched — choose one below.'),
  ).toBeVisible();

  const card = page
    .getByRole('listitem')
    .filter({ hasText: `Unplaced ${stamp}` });
  await card.getByRole('button', { name: 'Show the email' }).click();
  await expect(card.getByText('A letter about something.')).toBeVisible();

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(
    axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact!)),
  ).toEqual([]);

  await card.getByRole('button', { name: 'Choose a case…' }).click();
  await card
    .getByPlaceholder('Find a case by client, child or reference')
    .fill(`Triage Parent ${stamp}`);
  await card.getByRole('button', { name: 'File here' }).first().click();
  await expect(
    page.getByText(`Filed “Unplaced ${stamp}” to ${caseReference}.`),
  ).toBeVisible();

  // Both are on the case now.
  await page.getByRole('link', { name: caseReference }).first().click();
  await expect(page.getByText('Our question').first()).toBeVisible();
  await expect(page.getByText(`Unplaced ${stamp}`).first()).toBeVisible();
});
