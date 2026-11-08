import { defineConfig, devices } from '@playwright/test';

// Read-only checks against the real chain and a deployed page: no stubs, no signing, no web server.
const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) throw new Error('E2E_BASE_URL is required, e.g. E2E_BASE_URL=https://your-host npm run e2e:prod');

export default defineConfig({
  testDir: '.',
  retries: 0,
  workers: 2,
  timeout: 90000,
  expect: { timeout: 20000 },
  reporter: [['list']],
  outputDir: '../test-results/playwright-prod',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'prod-chromium', use: { browserName: 'chromium', ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } }],
});
