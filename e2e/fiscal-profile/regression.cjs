// Local compiled app + mocked HTTP boundary; never connects to a real backend.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    let row = { ...JSON.parse(fs.readFileSync('e2e/stage0/fixtures/report-a4.json', 'utf8')), id: 'fiscal-review' };
    const original = structuredClone(row.template_json.template);
    let saves = 0;
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'review.test') return route.abort();
      const filename = url.pathname.split('/').pop();
      const asset = /^[a-zA-Z0-9._-]+\.(js|css|ico|png|svg)$/.test(filename) ? filename : 'index.html';
      const contentType = asset.endsWith('.js') ? 'application/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html';
      return route.fulfill({ body: fs.readFileSync(`dist/zureo-report-designer/browser/${asset}`), contentType });
    });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/session') return route.fulfill({ json: {
        user: { id: 'review', email: 'review@example.test' }, company_id: row.company_id,
        role: 'editor', csrf_token: 'review-token', expires_at: '2099-01-01T00:00:00Z',
        companies: [{ id: row.company_id, name: 'Review', role: 'editor' }]
      } });
      if (path === '/api/templates' && route.request().method() === 'GET') return route.fulfill({ json: [row] });
      if (path === `/api/templates/${row.id}/design` && route.request().method() === 'PUT') {
        saves++;
        row = { ...row, ...route.request().postDataJSON() };
        return route.fulfill({ json: row });
      }
      return route.fulfill({ status: 404, json: { message: 'Unexpected review request' } });
    });

    await page.goto('http://review.test/designer/fiscal-review');
    await page.locator('app-design-canvas').waitFor();
    const save = page.getByRole('button', { name: 'Guardar', exact: true });
    await expect(save).toBeDisabled();
    await page.getByRole('button', { name: 'Perfil fiscal', exact: true }).click();
    await expect(page.getByText('Este molde no tiene un perfil fiscal declarado.', { exact: false })).toBeVisible();
    await expect(save).toBeDisabled();
    await page.getByRole('button', { name: 'Vista Previa', exact: true }).click();
    await page.getByRole('button', { name: 'HTML', exact: true }).click();
    const raw = page.locator('pre.raw-block');
    await expect(raw).toContainText('<html');
    const beforeHtml = await raw.textContent();

    await page.getByRole('button', { name: 'Perfil fiscal', exact: true }).click();
    await page.getByRole('button', { name: 'Configurar perfil fiscal', exact: true }).click();
    await page.getByLabel('Tipo CFE', { exact: true }).selectOption({ label: '111 — e-Factura' });
    await page.getByLabel('Régimen del emisor', { exact: true }).selectOption({ label: 'IVA mínimo' });
    await page.getByLabel('Soporte de impresión').selectOption({ label: 'Hoja' });
    await expect(save).toBeEnabled();
    await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
    await page.getByRole('button', { name: 'Rehacer', exact: true }).click();
    await expect(page.getByLabel('Soporte de impresión')).toHaveValue('sheet');
    fs.mkdirSync('tmp', { recursive: true });
    await page.screenshot({ path: 'tmp/fiscal-profile.png' });

    await page.getByRole('button', { name: 'Diseño', exact: true }).click();
    // The historical fixture includes overlapping hit surfaces; select its field
    // through the same DOM mouse handler without moving or modifying the layout.
    const binding = page.locator('.binding-tag').filter({ hasText: /^company\.Nombre$/ });
    await binding.dispatchEvent('mousedown', { button: 0 });
    await binding.dispatchEvent('mouseup', { button: 0 });
    await page.locator('app-properties-panel').getByRole('button', { name: 'Datos', exact: true }).click();
    const roles = page.locator('app-fiscal-roles');
    await expect(roles).toContainText('Sin roles asignados');
    await roles.getByRole('button', { name: 'Asignar sugerencia' }).click();
    await expect(roles.locator('.assigned')).toHaveCount(1);
    await roles.getByLabel('Agregar rol').selectOption('issuer.rut');
    await expect(roles.locator('.assigned')).toHaveCount(2);
    await roles.getByRole('button', { name: 'Quitar rol RUT del emisor' }).click();
    await roles.getByLabel('Agregar rol').selectOption('issuer.rut');
    await expect(roles.locator('.assigned')).toHaveCount(2);
    await save.click();
    await expect(save).toBeDisabled();
    assert.equal(saves, 1);
    const persisted = row.template_json.template;
    assert.equal(persisted.compliance.cfeType, 111);
    assert.equal(persisted.compliance.issuerRegime, 'vat-minimum');
    assert.equal(persisted.compliance.medium, 'sheet');
    assert.equal(persisted.fiscal, undefined);
    assert.deepEqual(persisted.futureExtension, original.futureExtension);
    const field = persisted.sections.header.elements.find(e => e.type === 'dataField');
    assert.deepEqual(field.fiscalRoles, ['issuer.name', 'issuer.rut']);
    const layout = structuredClone(persisted);
    delete layout.compliance;
    for (const section of Object.values(layout.sections)) for (const element of section.elements) delete element.fiscalRoles;
    assert.deepEqual(layout, original);

    await page.reload();
    await page.locator('app-design-canvas').waitFor();
    await expect(save).toBeDisabled();
    await page.getByRole('button', { name: 'Análisis fiscal', exact: true }).click();
    const results = page.locator('app-static-fiscal-results');
    await expect(results).toContainText('Cobertura incompleta');
    await results.getByLabel('Filtrar resultados').selectOption('pass');
    await expect(results).toContainText('PAP-01');
    await expect(results).not.toContainText('QR-02');
    await results.getByLabel('Filtrar resultados').selectOption('pending');
    await expect(results).toContainText('QR-02');
    await expect(results).toContainText('CON-05.11');
    await expect(results).toContainText('REF-03.08');
    await expect(save).toBeDisabled();
    await page.getByRole('button', { name: 'Perfil fiscal', exact: true }).click();
    await expect(page.getByLabel('Régimen del emisor').locator('option:checked')).toHaveText('IVA mínimo');
    await page.getByRole('button', { name: 'Vista Previa', exact: true }).click();
    await page.getByRole('button', { name: 'HTML', exact: true }).click();
    await expect(raw).toContainText('<html');
    assert.equal(await raw.textContent(), beforeHtml);
    await page.locator('.fiscal-context summary').click();
    await expect(page.locator('.fiscal-context')).toContainText('no es un CFE');
    await expect(page.getByRole('button', { name: 'Imprimir', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Render', exact: true }).click();
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('[data-render-element]').first()).toBeAttached();
    await expect(frame.locator('[data-render-source="invoiceLines.0"]')).toBeAttached();
    await expect(frame.locator('.element-rectangle')).toHaveCSS('position', 'absolute');
    await expect(page.locator('.renderer-context summary')).toContainText('carga finalizada', { timeout: 10000 });
    // Small single-sheet fixture isolates QR checks from pagination and unrelated artwork.
    const qr = structuredClone(original.sections.header.elements.find(element => element.type === 'qrCode'));
    qr.position = { x: 6, y: 6 };
    qr.size = { width: 20, height: 20 };
    qr.dataBinding = 'fiscal.qrPayload';
    const check = structuredClone(persisted);
    Object.assign(check.sections.header, { height: 55, elements: [qr] });
    Object.assign(check.sections.detail, { height: 20, elements: [] });
    Object.assign(check.sections.footer, { height: 0, elements: [] });
    row.template_json.template = check;
    const openFiscalPreview = async (expectQr = true) => {
      await page.reload();
      await page.getByRole('button', { name: 'Vista Previa', exact: true }).click();
      await page.getByRole('button', { name: 'Ejemplo CFE', exact: true }).click();
      await expect(frame.locator('svg[data-qr-modules]')).toHaveCount(expectQr ? 1 : 0);
      await expect(page.getByText('Validación de impresión', { exact: false })).toBeVisible();
      await page.evaluate(() => {
        window.printCalls = 0;
        document.querySelector('iframe').contentWindow.print = () => { window.printCalls++; };
      });
    };
    await openFiscalPreview();
    const print = page.getByRole('button', { name: 'Imprimir', exact: true });
    await print.click();
    await expect(page.getByRole('alert')).toContainText('QR-02');
    assert.equal(await page.evaluate(() => window.printCalls), 0);
    qr.size = { width: 28, height: 28 };
    qr.visibility = { type: 'conditional', expression: 'invoiceLines.length === 1' };
    await openFiscalPreview();
    await print.click();
    await expect.poll(() => page.evaluate(() => window.printCalls)).toBe(1);
    // Change the input and click print before the next iframe injection finishes.
    await page.evaluate(() => {
      window.printCalls = 0;
      const buttons = Array.from(document.querySelectorAll('app-preview button'));
      buttons.find(button => button.textContent.trim() === '1 artículo').click();
      buttons.find(button => button.textContent.trim() === 'Imprimir').click();
    });
    await expect(page.getByRole('alert')).toContainText('QR-01');
    assert.equal(await page.evaluate(() => window.printCalls), 0);
    assert.deepEqual(errors, []);
    console.log('Fiscal browser regression passed: legacy round trip, evidence and print gate.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
