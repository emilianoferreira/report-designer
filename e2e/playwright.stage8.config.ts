import { defineConfig } from '@playwright/test';
import path from 'node:path';
import baseline from './playwright.stage0.config';

if (!process.env['STAGE8_STORAGE_STATE'] || !process.env['STAGE8_CSRF']) throw new Error('Use npm run test:security with its isolated PostgreSQL.');
export default defineConfig({ ...baseline, testDir: '.',
  testMatch: ['**/stage0/tests/*.spec.ts', '**/stage8/tests/*.spec.ts'],
  snapshotPathTemplate: path.resolve(__dirname, 'stage0/snapshots/{arg}{ext}'),
  updateSnapshots: 'none',
  use: { ...baseline.use, storageState: process.env['STAGE8_STORAGE_STATE'] },
});
