import { defineConfig } from '@playwright/test';

/**
 * Default config: the network-stubbed browser smokes, which need only the web
 * dev server. The full end-to-end journey and the accessibility scans run under
 * playwright.e2e.config.ts (a real API + clean database) and are excluded here.
 *
 * PW_CHROMIUM lets a local run point at a preinstalled Chromium binary.
 */
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['journey.spec.ts', 'a11y.spec.ts'],
  use: {
    baseURL: 'http://localhost:5173',
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
