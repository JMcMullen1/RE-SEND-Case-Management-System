import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Importing schools from the DfE's register, against the real API over the
 * clean e2e database: a made-up file in the DfE's columns is read in the
 * browser, one area is chosen (Section 41 schools come from everywhere), the
 * change is checked, imported, and a second run finds nothing to do.
 */
async function signIn(page: Page, email = 'jamie.mcmullen@resend.demo') {
  await page.goto('/');
  await page.getByLabel('Account').selectOption(email);
  await page.getByLabel('Password').fill('resend-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function chooseFile(page: Page) {
  await page
    .locator('input[type=file]')
    .setInputFiles(`${import.meta.dirname}/fixtures/gias-sample.csv`);
  await expect(page.getByRole('status').first()).toContainText(
    '4 open schools in 2 areas',
  );
}

test('an admin imports the schools in their area from the DfE list', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('banner').getByRole('link', { name: 'Schools' }).click();
  await page.getByRole('link', { name: 'Import from the DfE list' }).click();
  await expect(
    page.getByRole('heading', { name: 'Import schools' }),
  ).toBeVisible();

  await chooseFile(page);
  await page.getByRole('checkbox', { name: /^Sampleshire/ }).check();
  await expect(page.getByText('1 area · 3 schools')).toBeVisible();

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(
    axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact!)),
  ).toEqual([]);

  await page.getByRole('button', { name: 'Check what will change' }).click();
  const check = page.getByRole('region', { name: '3. Check and import' });
  await expect(check.getByText('New schools', { exact: true })).toBeVisible();
  await check
    .getByRole('button', { name: 'Import: 3 new schools, 0 updated' })
    .click();
  await expect(page.getByText('3 schools added')).toBeVisible();

  // The directory has them, with the facts from the file.
  await page.getByRole('link', { name: 'Go to the schools directory' }).click();
  await page.getByPlaceholder(/Search by name/).fill('Riverside');
  await expect(
    page.getByRole('link', { name: 'Riverside Specialist College' }),
  ).toBeVisible();
  await expect(page.getByText(/Section 41/).first()).toBeVisible();

  // Again with the same file: nothing to do; the area is remembered.
  await page.goto('/admin/import-schools');
  await chooseFile(page);
  await expect(
    page.getByRole('checkbox', { name: /^Sampleshire/ }),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Check what will change' }).click();
  await expect(
    page.getByRole('button', { name: 'Nothing to import' }),
  ).toBeDisabled();
});
