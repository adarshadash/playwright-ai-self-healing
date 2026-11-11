import { defineConfig, devices } from '@playwright/test';

/**
 * Two projects:
 *  - chromium: UI tests against https://www.saucedemo.com
 *  - unit:     browser-free tests for the failure translator and migration agents
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'reports/html' }],
    ['./src/reporting/human-readable-reporter.ts', { outputDir: 'reports' }],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://www.saucedemo.com',
    testIdAttribute: 'data-test',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testDir: './tests/ui',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'migrated',
      testDir: './migration/output',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'unit',
      testDir: './tests/unit',
    },
  ],
});
