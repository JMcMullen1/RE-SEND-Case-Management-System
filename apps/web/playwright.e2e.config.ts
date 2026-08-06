import { defineConfig } from '@playwright/test';

/**
 * End-to-end journey config: a real API and web server over a clean, empty
 * `resend_e2e` database, with DEMO_MODE on so the journey can sign in. The API
 * launcher (serve-api.ts) prepares the database before the API boots. Only the
 * journey and accessibility specs run here; the network-stubbed browser smokes
 * run under the default config.
 *
 * PW_CHROMIUM lets a local run point at a preinstalled Chromium binary.
 */
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: './e2e',
  testMatch: ['journey.spec.ts', 'a11y.spec.ts'],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: [
    {
      command: 'npx tsx e2e/serve-api.ts',
      url: 'http://localhost:3000/health/ready',
      timeout: 90_000,
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -w @re-send/web',
      cwd: `${import.meta.dirname}/../..`,
      url: 'http://localhost:5173',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
