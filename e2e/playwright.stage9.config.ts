import { defineConfig } from '@playwright/test';
import authenticated from './playwright.stage8.config';

if (!process.env['STAGE9_BROWSER_HOME'] || !process.env['STAGE9_UNTRUSTED_HOME'])
  throw new Error('Run npm run test:preproduction with its isolated CA and database.');

export default defineConfig({ ...authenticated,
  testMatch: [...authenticated.testMatch as string[], '**/stage9/tests/*.spec.ts'],
  use: { ...authenticated.use, ignoreHTTPSErrors: false,
    launchOptions: {
      // Only this browser process uses the temporary NSS store; host trust is untouched.
      env: { ...process.env, HOME: process.env['STAGE9_BROWSER_HOME']! },
      args: ['--no-proxy-server', '--host-resolver-rules=MAP wrong.stage9.invalid 127.0.0.1'],
    },
  },
});
