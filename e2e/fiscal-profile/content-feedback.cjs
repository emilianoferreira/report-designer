// Compiled app with mocked API. No real backend, fiscal calculations or AI requests.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const row = { ...JSON.parse(fs.readFileSync('e2e/stage0/fixtures/report-a4.json', 'utf8')), id: 'content-feedback' };
    const template = row.template_json.template;
    const prototype = template.sections.header.elements.find(element => element.type === 'dataField');
    template.compliance = { schemaVersion: '1.0', jurisdiction: 'UY', output: 'browser', cfeType: 112, medium: 'sheet', issuerRegime: 'general' };
    template.page.dynamicHeight = false;
    template.sections.header.height = 50; template.sections.detail.height = 40; template.sections.footer.height = 20;
    template.sections.detail.elements = []; template.sections.footer.elements = [];
    const definitions = [
      ['payer', 'receiverName', 'recipient.name', 'Empresa Receptora', 'Otra Empresa', 'REC-FIELD.name', 'receiver'],
      ['amount', 'totalAmount', 'totals.amount', '100', '99', 'AMT-FIELD', 'amounts'],
      ['reference', 'references.0.series', 'reference.series', 'A', 'B', 'REF-FIELD', 'references']
    ];
    template.sections.header.elements = definitions.map(([id, path, role], index) => ({
      ...structuredClone(prototype), id, position: { x: 5, y: 5 + index * 12 }, size: { width: 60, height: 8 },
      style: { font: { family: 'Arial', size: 12, weight: 'normal', style: 'normal', color: '#000000' } },
      binding: { source: 'fiscal.' + path }, fiscalRoles: [role], visibility: { type: 'always' }, screenOnly: false, printOnly: false
    }));
    const before = JSON.stringify(template), page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; let writes = 0, aiRequests = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'feedback.test') return route.abort();
      const filename = url.pathname.split('/').pop();
      const asset = /^[a-zA-Z0-9._-]+\.(js|css|ico|png|svg)$/.test(filename) ? filename : 'index.html';
      return route.fulfill({ body: fs.readFileSync(`dist/zureo-report-designer/browser/${asset}`),
        contentType: asset.endsWith('.js') ? 'application/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html' });
    });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/session') return route.fulfill({ json: { user: { id: 'review', email: 'review@example.test' },
        company_id: row.company_id, role: 'editor', csrf_token: 'review-token', expires_at: '2099-01-01T00:00:00Z', companies: [{ id: row.company_id, name: 'Review', role: 'editor' }] } });
      if (path === '/api/templates' && route.request().method() === 'GET') return route.fulfill({ json: [row] });
      if (path.endsWith('/design')) { writes++; return route.fulfill({ json: row }); }
      if (path === '/api/fiscal/advice') {
        if (route.request().method() !== 'GET') aiRequests++;
        return route.fulfill({ json: { ruleIds: [] } });
      }
      return route.fulfill({ status: 404, json: {} });
    });
    const data = { invoice: {}, company: {}, invoiceLines: [], fiscal: { schemaVersion: '1.0', isCfe: true, cfeType: 112,
      issuerRegime: 'general', operationType: 'goods', finalConsumer: false, receiverDocumentType: 'RUC', receiverName: 'Empresa Receptora',
      receiverAddress: 'Domicilio', receiverDocumentNumber: '219876540012', receiverNonResidentWithoutRut: false,
      professionalSecrecy: false, receiverSectorException: false, exportOperation: false, currency: 'UYU', totalAmount: '100', totalPayable: '100',
      references: [{ global: false, cfeType: 111, cfeTypeName: 'e-Factura', series: 'A', number: '123' }], referencesComplete: true } };
    await page.goto('http://feedback.test/designer/content-feedback');
    const panel = page.locator('app-design-validation');
    await panel.locator('input[type=file]').setInputFiles({ name: 'content.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await expect(panel.locator('app-validation-feedback')).toContainText('Sin fallos que bloqueen', { timeout: 15000 });
    const receiver = panel.locator('[data-validation-family="receiver"]');
    await receiver.locator(':scope > summary').click(); await receiver.locator(':scope > details > summary').click();
    await receiver.getByRole('button', { name: 'Seleccionar payer', exact: true }).click();
    await expect(page.locator('[data-element-id="payer"]')).toHaveClass(/selected/);
    await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled();
    await receiver.getByRole('button', { name: 'Ver página en Vista Previa', exact: true }).first().click();
    await expect(page.locator('.renderer-context summary').filter({ hasText: 'carga finalizada' })).toBeVisible();
    await page.getByText('Validación de impresión', { exact: false }).click();
    const feedback = page.locator('app-preview app-validation-feedback'), print = page.getByRole('button', { name: 'Imprimir', exact: true });
    await expect(feedback).toContainText('Sin fallos que bloqueen');
    assert.equal(await feedback.locator('app-fiscal-advice').count(), 0);
    await page.evaluate(() => { window.printCalls = 0; document.querySelector('iframe:not([aria-hidden="true"])').contentWindow.print = () => { window.printCalls++; }; });
    await print.click(); await expect.poll(() => page.evaluate(() => window.printCalls)).toBe(1);
    for (const [id, , , original, wrong, rule, family] of definitions) {
      await page.evaluate(({ id, wrong }) => { document.querySelector('iframe:not([aria-hidden="true"])').contentDocument.querySelector(`[data-render-element="${id}"]`).textContent = wrong; }, { id, wrong });
      await print.click(); await expect(page.getByRole('alert')).toContainText(rule);
      await expect(feedback.locator(`[data-validation-family="${family}"]`)).toContainText('Confirmado · bloquea impresión del navegador');
      assert.equal(await page.evaluate(() => window.printCalls), 1);
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'HTML z-code', exact: true }).first().click()]);
      assert.ok(fs.readFileSync(await download.path(), 'utf8').includes('z-code'));
      await page.evaluate(({ id, original }) => { document.querySelector('iframe:not([aria-hidden="true"])').contentDocument.querySelector(`[data-render-element="${id}"]`).textContent = original; }, { id, original });
    }
    await print.click(); await expect.poll(() => page.evaluate(() => window.printCalls)).toBe(2);
    await expect(feedback).toContainText('Sin fallos que bloqueen');
    // Navigation from the actual blocked finding selects the precise template owner.
    await page.evaluate(() => { document.querySelector('iframe:not([aria-hidden="true"])').contentDocument.querySelector('[data-render-element="reference"]').textContent = 'B'; });
    await print.click(); await expect(page.getByRole('alert')).toContainText('REF-FIELD');
    await feedback.locator('[data-validation-family="references"]').getByRole('button', { name: 'Ir al elemento', exact: true }).click();
    await expect(page.locator('[data-element-id="reference"]')).toHaveClass(/selected/);
    await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Vista Previa', exact: true }).click();
    await expect(page.locator('[data-print-preparation] > summary')).toContainText('carga finalizada');
    await page.evaluate(() => { window.printCalls = 0; document.querySelector('iframe:not([aria-hidden="true"])').contentWindow.print = () => { window.printCalls++; }; });
    await print.click(); await expect.poll(() => page.evaluate(() => window.printCalls)).toBe(1);
    assert.deepEqual(errors, []); assert.equal(writes, 0); assert.equal(aiRequests, 0); assert.equal(JSON.stringify(template), before);
    console.log('Content feedback regression passed: receiver/amount/reference gate, pending allowance, selection, fresh DOM inspection and independent Zureo export.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
