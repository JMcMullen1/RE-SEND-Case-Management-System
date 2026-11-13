import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Phone-width case screen. Below the `md` breakpoint the regions stack and the
 * page scrolls as one; no region may collapse into a zero-height scroll area.
 * Runs against the real API over the clean e2e database.
 */

test.use({ viewport: { width: 390, height: 844 } });

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Account').selectOption('jamie.mcmullen@resend.demo');
  await page.getByLabel('Password').fill('resend-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Visible, with real height, and reachable by scrolling the page. */
async function expectShown(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeInViewport();
  const box = await locator.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(0);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const EML = [
  'From: A Parent <parent@example.invalid>',
  'To: Caseworker <caseworker@example.invalid>',
  'Subject: School meeting',
  'Date: Mon, 2 Nov 2026 09:00:00 +0000',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Hello, the school has asked to meet next week.',
  '',
].join('\r\n');

test('case screen regions are visible and scroll as one page at phone width', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/cases/new');
  await page.getByLabel('Full name').first().fill('Mobile Parent');
  await page.getByLabel('Full name').nth(1).fill('Mobile Child');
  await page.getByLabel('Type of case').selectOption('Section Appeal');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText('Case created.', { exact: false })).toBeVisible();

  await page.getByRole('tab', { name: 'Documents / Emails' }).click();
  await page.locator('input[type="file"][multiple]').setInputFiles([
    {
      name: 'school-report.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 mobile layout check'),
    },
    {
      name: 'parent-email.eml',
      mimeType: 'message/rfc822',
      buffer: Buffer.from(EML),
    },
  ]);
  await expect(page.getByText('All files (2)')).toBeVisible();

  const docList = page.getByRole('list').filter({ hasText: 'Download' });
  await expectShown(docList.getByText('school-report.pdf'));
  await expectShown(docList.getByText('parent-email.eml'));
  await expectShown(page.getByRole('heading', { name: 'Emails' }));
  await expectShown(page.getByText('No emails yet.', { exact: false }));
  await expectNoHorizontalScroll(page);

  // Layout-level axe checks at phone width (e.g. scrollable regions must be
  // reachable). Colour contrast is excluded here: the case screen's existing
  // amber and grey-400 text fails it independently of layout and is tracked
  // separately.
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .disableRules(['color-contrast'])
    .analyze();
  expect(
    axe.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    ),
  ).toEqual([]);

  // One page scroll: the document itself is taller than the viewport.
  const pageScrolls = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight,
  );
  expect(pageScrolls).toBe(true);

  await page.getByRole('tab', { name: 'Case details' }).click();
  await expectShown(page.getByRole('heading', { name: 'Case detail' }));

  for (const [tab, label, empty] of [
    ['Billables', 'New billable', 'No billables yet.'],
    ['Case notes', 'New note', 'No case notes yet.'],
  ] as const) {
    await page.getByRole('tab', { name: tab }).click();
    await expectShown(page.getByLabel(label));
    await expectShown(page.getByText(empty));
    await expectNoHorizontalScroll(page);
  }

  await page.getByRole('tab', { name: 'All' }).click();
  await expectShown(page.getByText('school-report.pdf'));
  await expectShown(page.getByText('No emails yet.', { exact: false }));
  await expectShown(page.getByText('No case notes yet.'));
  await expectNoHorizontalScroll(page);
});

test.describe('from md up', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('documents and emails sit side by side and scroll independently', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/cases/new');
    await page.getByLabel('Full name').first().fill('Desk Parent');
    await page.getByLabel('Full name').nth(1).fill('Desk Child');
    await page.getByLabel('Type of case').selectOption('Section Appeal');
    await page.getByRole('button', { name: 'Create case' }).click();
    await expect(
      page.getByText('Case created.', { exact: false }),
    ).toBeVisible();

    await page.getByRole('tab', { name: 'Documents / Emails' }).click();
    const docs = await page
      .getByRole('heading', { name: 'Documents' })
      .boundingBox();
    const emails = await page
      .getByRole('heading', { name: 'Emails' })
      .boundingBox();
    expect(emails!.x).toBeGreaterThan(docs!.x);
    expect(Math.abs(emails!.y - docs!.y)).toBeLessThan(2);

    // The page is pinned to the viewport; the panels scroll, not the window.
    const pageScrolls = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight,
    );
    expect(pageScrolls).toBe(false);
  });
});
