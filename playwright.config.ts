import { defineConfig, devices } from '@playwright/test';

const PORT = 5180;

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  expect: { timeout: 10000 },
  workers: 3,
  timeout: 60000,
  reporter: [['list']],
  outputDir: 'test-results/playwright',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', testIgnore: /desktop\.spec/, use: { browserName: 'chromium', ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } },
    ...[[1440, 900], [1920, 1080]].map(([width, height]) => ({
      name: `desktop-${width}`,
      testMatch: /(desktop|landing)\.spec/,
      use: { browserName: 'chromium' as const, viewport: { width, height }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
    })),
  ],
  webServer: {
    command: `npm run -s -w web build && npm run -s -w web preview -- --port ${PORT}`,
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: false,
    timeout: 120000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
