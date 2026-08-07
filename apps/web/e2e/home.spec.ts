import { expect, test } from '@playwright/test';

const USER = {
  id: 'u1',
  displayName: 'Case Worker',
  role: 'caseworker',
  active: true,
};

test('home page shows the product name', async ({ page }) => {
  // Stub the session so the auth gate lets the app render.
  await page.route('**/api/auth/session', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(USER),
    }),
  );
  await page.route('**/api/auth/accounts', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ demoMode: false, accounts: [] }),
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'reSEND' })).toBeVisible();
});
