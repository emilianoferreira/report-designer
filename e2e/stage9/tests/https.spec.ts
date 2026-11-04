import { test, expect } from '../../stage0/support';

test('HTTPS has valid browser trust, secure cookies and no cleartext API requests', async ({ page, context }) => {
  const cleartext: string[] = [];
  page.on('request', request => { if (request.url().startsWith('http:')) cleartext.push(request.url()); });
  const response = await page.goto('/templates');
  const details = await response!.securityDetails();
  expect(details?.protocol).toMatch(/^TLS 1\.[23]$/);
  expect(details?.issuer).toContain(process.env['STAGE9_CA_SUBJECT'] || 'stage9-isolated-ca');
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
  const cookie = (await context.cookies()).find(c => c.name === 'rd_session')!;
  expect(cookie.secure).toBe(true); expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe('Strict');
  expect(await page.evaluate(() => document.cookie)).not.toContain('rd_session');
  expect((await context.request.get('/api/auth/session')).status()).toBe(200);
  expect(cleartext).toEqual([]);
});

test('browser rejects both an untrusted CA and a mismatching hostname', async ({ browser, playwright }) => {
  const wrongHost = new URL(process.env['STAGE0_UI_URL']!);
  wrongHost.hostname = 'wrong.stage9.invalid';
  const context = await browser.newContext({ ignoreHTTPSErrors: false });
  try {
    const page = await context.newPage();
    await expect(page.goto(wrongHost.href)).rejects.toThrow(/ERR_CERT_COMMON_NAME_INVALID/);
  } finally { await context.close(); }
  const untrusted = await playwright.chromium.launch({ headless: true,
    env: { ...process.env, HOME: process.env['STAGE9_UNTRUSTED_HOME']! }, args: ['--no-proxy-server'] });
  try {
    const page = await untrusted.newPage({ ignoreHTTPSErrors: false });
    await expect(page.goto(process.env['STAGE0_UI_URL']!)).rejects.toThrow(/ERR_CERT_AUTHORITY_INVALID/);
  } finally { await untrusted.close(); }
});

test('HTTP redirects navigation but never authenticates or forwards API writes', async ({ context, db }) => {
  const http = process.env['STAGE9_HTTP_URL']!;
  const before = (await db.query('SELECT count(*)::int AS n FROM auth_sessions')).rows[0].n;
  const redirect = await context.request.get(http + '/price-labels?https=required', { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers()['location']).toBe(process.env['STAGE0_UI_URL'] + '/price-labels?https=required');
  const blocked = await context.request.post(http + '/api/auth/login', {
    data: { email: 'not-forwarded@stage9.invalid', password: 'not-forwarded' },
    headers: { 'X-CSRF-Token': 'login' }, maxRedirects: 0,
  });
  expect(blocked.status()).toBe(426);
  expect(blocked.headers()['set-cookie']).toBeUndefined();
  expect(await blocked.json()).toEqual({ statusCode: 426, message: 'HTTPS required' });
  expect((await db.query('SELECT count(*)::int AS n FROM auth_sessions')).rows[0].n).toBe(before);
});
