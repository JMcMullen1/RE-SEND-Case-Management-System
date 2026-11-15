import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Searching inside documents, against the real API over the e2e database: a
 * made-up case with a document is searched for across the caseload and from
 * the case itself.
 */
async function signIn(page: Page, email = 'jamie.mcmullen@resend.demo') {
  await page.goto('/');
  await page.getByLabel('Account').selectOption(email);
  await page.getByLabel('Password').fill('resend-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('find a word inside a document, across the caseload and on the case', async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.getByRole('link', { name: 'Search documents' }),
  ).toBeVisible();

  // A made-up case and report.
  const created = await page.request.post('/api/cases', {
    data: {
      client: { fullName: 'Searchable Parent' },
      child: { fullName: 'Searchable Child' },
      case: { currentWork: 'Section Appeal' },
    },
  });
  const { caseId } = await created.json();
  const upload = await page.request.post(
    `/api/cases/${caseId}/documents?category=Expert%20Report`,
    {
      multipart: {
        file: {
          name: 'ep-report-searchable.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from(
            'The educational psychologist assessed the child over two sessions and recommends weekly occupational therapy.',
          ),
        },
      },
    },
  );
  expect(upload.ok()).toBe(true);

  await page.getByRole('link', { name: 'Search documents' }).click();
  await page.getByRole('searchbox').fill('assessment therapy');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('status')).toHaveText('1 match.');
  await expect(
    page.getByRole('link', { name: /ep-report-searchable\.txt/ }),
  ).toBeVisible();
  // Matching words are highlighted (as plain text).
  await expect(page.locator('mark', { hasText: 'assessed' })).toBeVisible();
  await expect(page.locator('mark', { hasText: 'therapy' })).toBeVisible();
  await page.screenshot({ path: 'test-results/search.png' });

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

  // Nothing found is said plainly.
  await page.getByRole('searchbox').fill('xylophone');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('status')).toHaveText(/Nothing matched/);

  // From the result to the case, opened on its documents.
  await page.getByRole('searchbox').fill('occupational');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('link', { name: /^RS-/ }).click();
  await expect(
    page.getByRole('tab', { name: 'Documents / Emails' }),
  ).toHaveAttribute('aria-selected', 'true');
  // And searching from the case itself.
  await page
    .getByRole('searchbox', { name: /this case’s documents and emails/ })
    .fill('sessions');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'match' }),
  ).toHaveText('1 match.');
});
