import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Accessibility gate. axe-core scans the key screens; the build fails on any
 * serious or critical violation (WCAG 2.2 AA). Runs against the real app over
 * the clean e2e database.
 */

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  if (serious.length > 0) {
    console.error(
      `axe violations on ${label}:\n` +
        serious
          .map((v) => `- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`)
          .join('\n'),
    );
  }
  expect(serious, `serious/critical axe violations on ${label}`).toEqual([]);
}

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Account').selectOption('jamie.mcmullen@resend.demo');
  await page.getByLabel('Password').fill('resend-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('sign-in screen has no serious accessibility violations', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await scan(page, 'sign-in');
});

test('the app screens have no serious accessibility violations', async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.getByText('No cases have been added yet.', { exact: false }),
  ).toBeVisible();
  await scan(page, 'case list (empty)');

  await page.goto('/cases/new');
  await expect(page.getByRole('button', { name: 'Create case' })).toBeVisible();
  await scan(page, 'add case');

  await page.goto('/calendar');
  await expect(page.getByRole('tab', { name: 'Agenda' })).toBeVisible();
  await scan(page, 'calendar');
});
