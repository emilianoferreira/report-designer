import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4200',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  // Legacy NestJS suite. Use test:cutover for both backends on disposable PostgreSQL.
  webServer: [
    {
      command: 'cd .. && npm run server:nestjs',
      port: 3000,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'cd .. && npm run start:nestjs',
      port: 4200,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
