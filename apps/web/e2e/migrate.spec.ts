import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Importing the case list, against the real API over the clean e2e database:
 * a made-up workbook in the charity's own headings is read in the browser,
 * an unrecognised status is matched by hand, the rows are checked in the
 * simple and advanced views, and the ready rows are imported.
 */
async function signIn(page: Page, email = 'jamie.mcmullen@resend.demo') {
  await page.goto('/');
  await page.getByLabel('Account').selectOption(email);
  await page.getByLabel('Password').fill('resend-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('an admin imports the case list after checking it', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('link', { name: 'Staff' })).toBeVisible();
  await page.goto('/admin/import');
  await page
    .locator('input[type=file]')
    .setInputFiles(`${import.meta.dirname}/fixtures/case-list-sample.xlsx`);

  // Every heading matched to the system's own fields.
  await expect(
    page.getByText(/23 matched to the system’s fields/),
  ).toBeVisible();

  // "On hold" is not a status: it must be matched before that row imports.
  const onHold = page.getByLabel('Status “On hold” means');
  await expect(onHold).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Need fixing \(2\)/ }),
  ).toBeVisible();
  await onHold.selectOption('Dormant');
  await expect(
    page.getByRole('button', { name: /To import \(3\)/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Need fixing \(1\)/ }),
  ).toBeVisible();

  // Simple view: the essentials; the row without a date says why.
  await expect(
    page.getByRole('cell', { name: 'Section B F & I' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Need fixing/ }).click();
  await page.getByRole('button', { name: /about row 5/ }).click();
  await expect(page.getByText('No date of enquiry.')).toBeVisible();

  // Advanced view: every column, and each value as written and as imported.
  await page.getByRole('button', { name: /All rows/ }).click();
  await page.getByRole('tab', { name: 'advanced' }).click();
  await expect(
    page.getByRole('columnheader', { name: 'QB Notes' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /about row 2/ }).click();
  await expect(page.getByText('Section BF&I', { exact: true })).toBeVisible();
  // Nothing pushes the page wider than the window.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/import-preview.png',
    fullPage: true,
  });

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

  await page.getByRole('button', { name: 'Import 3 cases…' }).click();
  await page
    .getByRole('dialog', { name: 'Import 3 cases?' })
    .getByRole('button', { name: 'Import' })
    .click();
  await expect(page.getByText('Import complete')).toBeVisible();
  await expect(
    page.getByText(/3\s+cases imported, with 2 new clients/),
  ).toBeVisible();

  // The imported cases are in the case list straight away.
  await page.getByRole('link', { name: 'Go to the case list' }).click();
  await expect(page.getByText('Robin').first()).toBeVisible();
});
