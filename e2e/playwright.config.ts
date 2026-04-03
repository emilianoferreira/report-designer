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
  // Expect both Angular dev server (4200) and NestJS API (3000) to be running
  webServer: [
    {
      command: 'cd .. && npm run server',
      port: 3000,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'cd .. && npm start',
      port: 4200,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
