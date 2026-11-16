import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';

/**
 * Full export, then Full import, through the screens: a backup is taken, a
 * made-up case is added afterwards, and putting the backup back removes it
 * while every case from the backup is still there, with its Word document
 * (itself a ZIP inside the backup) back byte for byte. Runs last: it replaces
 * everything in the e2e database.
 */
async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Account').selectOption('jamie.mcmullen@resend.demo');
  await page.getByLabel('Password').fill('resend-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Cases' })).toBeVisible();
}

test('a full export can be put back with Full import', async ({ page }) => {
  const stamp = Date.now();
  await signIn(page);

  const before = await page.request.post('/api/cases', {
    data: {
      client: { fullName: `Kept Parent ${stamp}` },
      child: { fullName: `Kept Child${stamp}` },
      case: { currentWork: 'Section Appeal' },
    },
  });
  expect(before.ok()).toBe(true);
  const { caseId } = await before.json();
  // A Word document is a ZIP: it must come back whole, not unpacked.
  const docx = Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'word/document.xml': strToU8(`<w:document>${stamp}</w:document>`),
    }),
  );
  const uploaded = await page.request.post(
    `/api/cases/${caseId}/documents?category=Plan`,
    {
      multipart: {
        file: {
          name: 'plan.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: docx,
        },
      },
    },
  );
  expect(uploaded.ok()).toBe(true);
  const documentId = (await uploaded.json()).document.id as string;

  await page.goto('/admin/export');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download full export' }).click();
  const backup = await (await downloading).path();

  const after = await page.request.post('/api/cases', {
    data: {
      client: { fullName: `Later Parent ${stamp}` },
      child: { fullName: `Later Child${stamp}` },
      case: { currentWork: 'Section Appeal' },
    },
  });
  expect(after.ok()).toBe(true);

  await page
    .getByRole('navigation', { name: 'Admin' })
    .getByRole('link', { name: 'Full import' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Full import' }),
  ).toBeVisible();
  await page.getByLabel('The full export (.zip)').setInputFiles(backup);
  await expect(page.getByText(/records in \d+ tables/)).toBeVisible({
    timeout: 30_000,
  });

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(
    axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact!)),
  ).toEqual([]);

  const replace = page.getByRole('button', {
    name: 'Replace everything with this backup',
  });
  await expect(replace).toBeDisabled();
  await page.getByLabel(/type REPLACE/).fill('REPLACE');
  await replace.click();
  await expect(
    page.getByRole('heading', { name: 'Everything has been put back' }),
  ).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Go to the cases' }).click();
  await expect(page.getByRole('heading', { name: 'Cases' })).toBeVisible();
  const found = async (name: string) =>
    JSON.stringify(
      await (
        await page.request.get(`/api/cases?q=${encodeURIComponent(name)}`)
      ).json(),
    ).includes(name);
  expect(await found(`Kept Child${stamp}`)).toBe(true);
  expect(await found(`Later Child${stamp}`)).toBe(false);
  const content = await page.request.get(
    `/api/documents/${documentId}/content`,
  );
  expect(content.ok()).toBe(true);
  expect(Buffer.compare(await content.body(), docx)).toBe(0);
});
