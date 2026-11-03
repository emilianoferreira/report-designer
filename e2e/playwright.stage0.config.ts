import { defineConfig } from '@playwright/test';

// Only the isolated runner may launch this suite. Never fall back to dev ports.
if (!process.env['STAGE0_RUN_ID'] || !process.env['STAGE0_API_URL'] || !process.env['STAGE0_UI_URL']) {
  throw new Error('Run npm run test:migration; this suite requires its disposable PostgreSQL cluster.');
}

export default defineConfig({
  testDir: './stage0/tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: process.env['STAGE0_RESULTS_DIR'] + '/browser',
  snapshotPathTemplate: '{testDir}/../snapshots/{arg}{ext}',
  // A normal run must fail on missing snapshots, never silently establish a baseline.
  updateSnapshots: process.env['STAGE0_RECORD'] === '1' ? 'all' : 'none',
  reporter: [['list'], ['json', { outputFile: process.env['STAGE0_RESULTS_DIR'] + '/results.json' }]],
  use: {
    baseURL: process.env['STAGE0_UI_URL'],
    headless: true,
    viewport: { width: 1600, height: 1000 },
    locale: 'es-UY',
    timezoneId: 'America/Montevideo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
