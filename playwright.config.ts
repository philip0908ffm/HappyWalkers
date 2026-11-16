import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-End-Tests (Thomas Becker). Startet Server (Port 3100) und Vite (Port 5174)
 * gegen die Test-Datenbank `gehmeinsam_e2e`.
 */
const DB = process.env.E2E_DATABASE_URL ?? 'postgres://gehmeinsam:gehmeinsam@localhost:5432/gehmeinsam_e2e';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'off',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  },
  projects: [
    {
      name: 'laptop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 768 },
        launchOptions: { executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' },
      },
    },
    {
      // Laptop 1280 px bei 200 % Browser-Zoom ≙ 640 CSS-Pixel Breite
      name: 'zoom-200',
      testMatch: /ansichten\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 640, height: 360 },
        launchOptions: { executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' },
      },
    },
    {
      name: 'tablet',
      testMatch: /ansichten\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 820, height: 1180 },
        hasTouch: true,
        launchOptions: { executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' },
      },
    },
  ],
  webServer: [
    {
      command: 'npm run e2e:server',
      url: 'http://localhost:3100/api/v1/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { DATABASE_URL: DB },
    },
    {
      command: 'npx vite --port 5174 --strictPort',
      cwd: './web',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_API_TARGET: 'http://localhost:3100' },
    },
  ],
});
