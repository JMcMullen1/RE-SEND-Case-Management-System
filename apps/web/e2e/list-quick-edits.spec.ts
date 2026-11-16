import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Editing from the case list, against the real API over the clean e2e
 * database: a made-up case's status and teams are changed in place, and a
 * weekly review written in its row's drop-down shows under Updated.
 */
async function signIn(page: Page, email = 'jamie.mcmullen@resend.demo') {
  await page.goto('/');
  await page.getByLabel('Account').selectOption(email);
  await page.getByLabel('Password').fill('resend-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('type, status, team and the weekly review are edited straight from the case list', async ({
  page,
}) => {
  const stamp = Date.now();
  await signIn(page);
  // Signed in before anything is created (the session cookie must exist).
  await expect(page.getByRole('heading', { name: 'Cases' })).toBeVisible();
  const created = await page.request.post('/api/cases', {
    data: {
      client: { fullName: `Quickedit Parent${stamp}` },
      child: { fullName: `Rowan Quickedit${stamp}` },
      case: { currentWork: 'Section Appeal', team: ['TSA'] },
    },
  });
  expect(created.ok()).toBe(true);
  await page.reload();
  await page
    .getByPlaceholder('Search client, child, reference or notes')
    .fill(`Quickedit Parent${stamp}`);
  const row = page.getByRole('row').filter({ hasText: `Parent${stamp}` });
  await expect(row).toHaveCount(1);
  // One view: no Simple / Advanced switch.
  await expect(page.getByRole('button', { name: 'Simple' })).toHaveCount(0);

  await row.getByRole('button', { name: /^Status: Enquiry/ }).click();
  await page.getByRole('menuitemradio', { name: /Active/ }).click();
  await expect(
    row.getByRole('button', { name: /^Status: Active/ }),
  ).toBeVisible();

  await row
    .getByRole('button', { name: /^Type of case: Section Appeal/ })
    .click();
  await page.getByRole('menuitemradio', { name: /Annual Review/ }).click();
  await expect(
    row.getByRole('button', { name: /^Type of case: Annual Review/ }),
  ).toBeVisible();

  await row.getByRole('button', { name: /^Team: TSA/ }).click();
  const teams = page.getByRole('dialog', { name: /^Team/ });
  await teams.getByLabel('Admin').check();
  await teams.getByLabel('TSA').uncheck();
  await page.keyboard.press('Escape');
  await expect(row.getByRole('button', { name: /^Team: Admin/ })).toBeVisible();

  await row.getByRole('button', { name: 'Expand row' }).click();
  await page.getByLabel('Weekly review').fill(`Week ${stamp}: bundle chased.`);

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(
    axe.violations
      .filter((v) => ['serious', 'critical'].includes(v.impact!))
      .map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
      ),
  ).toEqual([]);

  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(row.getByText(`Week ${stamp}: bundle chased.`)).toBeVisible();
  await expect(row.getByText('Today', { exact: true })).toBeVisible();

  // Saved for good.
  await page.reload();
  await page
    .getByPlaceholder('Search client, child, reference or notes')
    .fill(`Quickedit Parent${stamp}`);
  await expect(
    row.getByRole('button', { name: /^Status: Active/ }),
  ).toBeVisible();
  await expect(row.getByRole('button', { name: /^Team: Admin/ })).toBeVisible();
  await expect(
    row.getByRole('button', { name: /^Type of case: Annual Review/ }),
  ).toBeVisible();
});
