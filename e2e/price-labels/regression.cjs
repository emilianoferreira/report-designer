const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' }), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.setDefaultTimeout(15000);
    const consoleMessages = [];
    page.on('console', message => consoleMessages.push({ type: message.type(), text: message.text() }));
    page.on('pageerror', error => consoleMessages.push({ type: 'pageerror', text: error.message }));
    const fixture = JSON.parse(fs.readFileSync('e2e/stage0/fixtures/price-label.json', 'utf8'));
    let row = { ...fixture, id: 'e0000000-0000-4000-8000-000000000012', version: 1 };
    fixture.template_json.label.gapX = 0;
    let saveDelay = 0;
    let failSave = false;
    let creations = 0;
    let acceptDialog = false;
    let dialogs = 0;
    page.on('dialog', async dialog => { dialogs++; await (acceptDialog ? dialog.accept() : dialog.dismiss()); });
    // Serve the compiled application entirely from local files through Playwright.
    // No browser network connection or running backend is needed for this review.
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
      if (path === '/api/auth/session') {
        return route.fulfill({ json: { user: { id: 'review-user', email: 'review@example.test' }, company_id: fixture.company_id, role: 'editor', csrf_token: 'review-token', expires_at: '2099-01-01T00:00:00Z', companies: [{ id: fixture.company_id, name: 'Review', role: 'editor' }] } });
      }
      if (path === '/api/templates' && route.request().method() === 'GET') return route.fulfill({ json: [row] });
      if (route.request().method() !== 'GET' && failSave) return route.fulfill({ status: 500, json: { message: 'Test save failure' } });
      if (path === '/api/templates' && route.request().method() === 'POST') {
        creations++;
        const sent = route.request().postDataJSON();
        row = { ...row, ...sent, id: 'e0000000-0000-4000-8000-000000000099', version: 1 };
        if (saveDelay) await new Promise(resolve => setTimeout(resolve, saveDelay));
        return route.fulfill({ json: row });
      }
      if ([ `/api/templates/${row.id}/design`, `/api/templates/${row.id}` ].includes(path) && route.request().method() === 'PUT') {
        const sent = route.request().postDataJSON();
        row = { ...row, nombre: sent.nombre ?? row.nombre, template_json: sent.template_json, version: row.version + 1 };
        if (saveDelay) await new Promise(resolve => setTimeout(resolve, saveDelay));
        return route.fulfill({ json: row });
      }
      return route.fulfill({ status: 404, json: { message: 'Unmocked review request' } });
    });
    await page.goto('http://review.test/price-labels');
    await page.locator('app-price-label-canvas .price-content').waitFor();
    const result = {};
    const templateMenu = page.locator('.template-menu');
    async function openTemplateMenu() {
      if (!(await templateMenu.evaluate(el => el.open))) await templateMenu.locator('summary').click();
    }
    async function selectSavedTemplate() { await openTemplateMenu(); await page.locator('.template-select').selectOption(row.id); }
    async function newTemplate() { await openTemplateMenu(); await page.getByRole('button', { name: 'Nueva plantilla', exact: true }).click(); }
    async function openSettings() {
      const toggle = page.getByRole('button', { name: 'Configuración de impresión', exact: true });
      if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    }
    async function dataTab() { await page.locator('app-price-label-properties').getByRole('button', { name: 'Datos', exact: true }).click(); }
    const initialBarcode = await page.locator('.barcode-content svg').evaluate(el => { const clone = el.cloneNode(true); clone.removeAttribute('style'); return clone.outerHTML; });
    assert.equal(await page.locator('.designer-header').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(102, 22, 75)');
    await page.getByRole('button', { name: 'Ocultar herramientas', exact: true }).click();
    await page.getByRole('button', { name: 'Ocultar propiedades', exact: true }).click();
    await page.getByRole('button', { name: 'Mostrar herramientas', exact: true }).click();
    await page.getByRole('button', { name: 'Mostrar propiedades', exact: true }).click();
    fs.mkdirSync('tmp', { recursive: true });
    await page.screenshot({ path: 'tmp/labels-desktop.png' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: 'tmp/labels-notebook.png' });
    assert.ok((await page.locator('.designer-status').boundingBox()).y < 800);
    await openSettings();
    await page.screenshot({ path: 'tmp/labels-settings.png' });
    await page.getByRole('button', { name: 'Configuración de impresión', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.setViewportSize({ width: 1600, height: 1000 });
    result.canvasFont = await page.locator('.price-content').evaluate(el => ({ fontPx: parseFloat(getComputedStyle(el).fontSize), boxPx: el.getBoundingClientRect().width }));
    await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
    const preview = page.frameLocator('iframe[title="Vista previa de etiquetas"]');
    await preview.locator('.label-price').first().waitFor();
    assert.equal(await preview.locator('.label-barcode svg').first().evaluate(el => el.outerHTML), initialBarcode);
    result.previewFont = await preview.locator('.label-price').first().evaluate(el => ({ fontPx: parseFloat(getComputedStyle(el).fontSize), boxPx: el.getBoundingClientRect().width }));
    result.fontRelativeScale = (result.canvasFont.fontPx / result.canvasFont.boxPx) / (result.previewFont.fontPx / result.previewFont.boxPx);
    result.initialPageGeometry = await preview.locator('.page').evaluate(el => {
      const pageRect = el.getBoundingClientRect();
      const cells = [...document.querySelectorAll('.label-cell')].map(cell => cell.getBoundingClientRect());
      return { pageWidth: pageRect.width, lastLabelRight: cells.at(-1).right - pageRect.left, contentWidth: pageRect.width - parseFloat(getComputedStyle(el).paddingLeft) - parseFloat(getComputedStyle(el).paddingRight), labelGridWidth: cells.at(-1).right - cells[0].left };
    });
    await page.evaluate(() => {
      window.printEvents = 0;
      const frame = document.querySelector('iframe').contentWindow;
      const nativePrint = frame.print.bind(frame);
      frame.print = () => {
        frame.addEventListener('beforeprint', () => window.printEvents++);
        nativePrint();
      };
    });
    await page.getByRole('button', { name: 'Imprimir', exact: true }).click();
    await page.waitForTimeout(300);
    result.printMessages = consoleMessages.filter(m => /print|sandbox|modal/i.test(m.text));
    await page.getByRole('button', { name: 'Diseño', exact: true }).click();
    await openSettings();
    await page.getByLabel('Filas', { exact: true }).fill('1');
    await page.getByLabel('Filas', { exact: true }).press('Tab');
    await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
    await preview.locator('.label-cell').first().waitFor();
    await page.getByLabel('Copias por articulo').fill('3');
    await page.getByLabel('Copias por articulo').press('Tab');
    await page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.querySelectorAll('.label-cell').length === 12);
    result.pagination = await preview.locator('body').evaluate(() => ({ pages: document.querySelectorAll('.page').length, cells: document.querySelectorAll('.label-cell').length, distinctRowTops: [...new Set([...document.querySelectorAll('.label-cell')].map(el => el.getBoundingClientRect().top))].length }));
    const printPage = await browser.newPage();
    await printPage.setContent(await preview.locator('html').evaluate(el => el.outerHTML));
    const pdf = await printPage.pdf({ preferCSSPageSize: true });
    assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 3);
    await printPage.close();
    await page.getByRole('button', { name: 'Diseño', exact: true }).click();
    await page.locator('.barcode-content').click();
    await dataTab();
    await page.getByLabel('Mostrar texto', { exact: true }).uncheck();
    await page.locator('.barcode-content svg text').waitFor({ state: 'detached' });
    result.hiddenBarcodeTextStillVisible = await page.locator('.barcode-content svg text').isVisible();
    acceptDialog = true;
    await selectSavedTemplate();
    acceptDialog = false;
    const name = page.locator('.template-name-input');
    await name.fill('Nombre cambiado');
    await name.press('Tab');
    const saveResponse = page.waitForResponse(response => response.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await saveResponse;
    await page.waitForFunction(() => !document.querySelector('button.primary').disabled);
    result.rename = { requested: 'Nombre cambiado', storedJsonName: row.template_json.name, storedRowName: row.nombre, editorNameAfterSave: await name.inputValue() };
    saveDelay = 1200;
    await page.locator('.text-content').click();
    await dataTab();
    const fixedText = page.getByLabel('Texto fijo', { exact: true });
    await fixedText.fill('Texto anterior');
    await fixedText.press('Tab');
    const delayedSave = page.waitForResponse(response => response.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await fixedText.fill('Texto editado durante guardado');
    await fixedText.press('Tab');
    await delayedSave;
    await page.waitForFunction(() => document.querySelector('.text-content').textContent.trim() === 'Texto editado durante guardado');
    result.editDuringSave = { requested: 'Texto editado durante guardado', editorTextAfterSave: await fixedText.inputValue() };
    await name.fill('Borrador sin guardar');
    await name.press('Tab');
    await newTemplate();
    assert.equal(await name.inputValue(), 'Borrador sin guardar');
    acceptDialog = true;
    await newTemplate();
    await page.waitForFunction(() => document.querySelector('.template-name-input').value === 'Etiqueta chica con codigo de barras');
    result.newDiscardsDraft = { dialogs, nameAfterNew: await name.inputValue() };
    result.pageErrors = consoleMessages.filter(m => m.type === 'pageerror');
    assert.equal(result.rename.editorNameAfterSave, 'Nombre cambiado');
    assert.equal(result.rename.storedRowName, 'Nombre cambiado');
    assert.equal(result.pagination.pages, 3);
    assert.equal(result.pagination.distinctRowTops, 3);
    assert.equal(result.hiddenBarcodeTextStillVisible, false);
    assert.equal(result.editDuringSave.editorTextAfterSave, 'Texto editado durante guardado');
    assert.equal(result.newDiscardsDraft.dialogs, 3);
    assert.ok(Math.abs(result.fontRelativeScale - 1) < 0.001);
    assert.ok(result.initialPageGeometry.labelGridWidth <= result.initialPageGeometry.contentWidth + 0.1);
    assert.equal(await page.evaluate(() => window.printEvents), 1);
    assert.equal(result.printMessages.some(m => m.text.includes("Ignored call to 'print()'")), false);
    assert.deepEqual(result.pageErrors, []);
    await openSettings();
    await page.getByLabel('Separación horizontal', { exact: true }).fill('2');
    await page.getByLabel('Separación horizontal', { exact: true }).press('Tab');
    assert.equal(await page.getByRole('alert').count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Guardar', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Imprimir', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Exportar HTML', exact: true }).isDisabled(), true);
    // Compare the existing migration snapshot against actual browser output.
    row = { ...fixture, id: 'e0000000-0000-4000-8000-000000000012', nombre: 'Contrato etiqueta UI', template_json: JSON.parse(fs.readFileSync('e2e/stage0/snapshots/price-label-saved-design.json', 'utf8')) };
    await page.reload();
    await selectSavedTemplate();
    await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
    await page.getByLabel('Copias por articulo').fill('2');
    await page.getByLabel('Copias por articulo').press('Tab');
    await page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.querySelectorAll('.label-cell').length === 8);
    assert.equal((await preview.locator('html').evaluate(el => el.outerHTML)).replace(/\r\n/g, '\n').trimEnd(), fs.readFileSync('e2e/stage0/snapshots/price-label-preview.html', 'utf8').replace(/\r\n/g, '\n').trimEnd());
    await page.getByRole('button', { name: 'Diseño', exact: true }).click();
    await newTemplate();
    await name.fill('Nueva plantilla'); await name.press('Tab');
    const createdResponse = page.waitForResponse(r => r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await name.fill('Edición durante creación'); await name.press('Tab');
    await createdResponse;
    await page.waitForFunction(() => !document.querySelector('button.primary').disabled);
    assert.equal(await name.inputValue(), 'Edición durante creación');
    assert.equal(await page.locator('.template-select').inputValue(), row.id);
    failSave = true;
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.save-status')?.textContent.includes('No se pudo guardar'));
    assert.equal(await name.inputValue(), 'Edición durante creación');
    failSave = false; saveDelay = 0;
    const finalSave = page.waitForResponse(r => r.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click(); await finalSave;
    await page.waitForFunction(() => !document.querySelector('button.primary').disabled);
    assert.equal(creations, 1);
    assert.equal(row.nombre, 'Edición durante creación');
    const previousDialogs = dialogs;
    await newTemplate();
    assert.equal(dialogs, previousDialogs);
    await page.getByRole('button', { name: 'Código', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.barcode-content svg').length === 2);
    assert.equal(await page.locator('.barcode-content svg').count(), 2);
    await dataTab();
    await page.getByRole('combobox', { name: /^Tipo/ }).selectOption('EAN8');
    await page.getByRole('img', { name: 'Código de barras no válido', exact: true }).waitFor();
    await page.getByRole('combobox', { name: /^Tipo/ }).selectOption('EAN13');
    await page.waitForFunction(() => document.querySelectorAll('.barcode-content svg').length === 2);
    await page.getByRole('button', { name: 'Eliminar elemento', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.barcode-content svg').length === 1);
    await page.locator('.barcode-content').click();
    await page.locator('app-price-label-properties').getByRole('button', { name: 'General', exact: true }).click();
    await page.getByRole('button', { name: 'Snap', exact: true }).click();
    await page.getByRole('button', { name: 'Elem', exact: true }).click();
    const x = page.getByLabel('X mm', { exact: true });
    const beforeX = Number(await x.inputValue());
    const bar = await page.locator('.barcode-content').boundingBox();
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await page.mouse.down(); await page.mouse.move(bar.x + bar.width / 2 + 12, bar.y + bar.height / 2); await page.mouse.up();
    await page.waitForFunction(value => Number(document.querySelector('app-price-label-properties input[type=number]').value) > value, beforeX);
    assert.equal(await page.locator('.barcode-content svg').count(), 1);
    await page.screenshot({ path: 'tmp/labels-properties.png' });
    assert.deepEqual(consoleMessages.filter(m => m.type === 'pageerror'), []);
    await require('./precision.cjs')(page, newTemplate, openSettings);
    // The shared shell still leaves the report editor usable beneath the session bar.
    row = { ...JSON.parse(fs.readFileSync('e2e/stage0/fixtures/report-a4.json', 'utf8')), id: 'e0000000-0000-4000-8000-000000000030', version: 1 };
    await page.goto('http://review.test/designer/' + row.id);
    await page.locator('app-design-canvas').waitFor();
    await page.screenshot({ path: 'tmp/reports-reference.png' });
    const reportBounds = await page.locator('app-designer-page').boundingBox();
    assert.ok(reportBounds.y + reportBounds.height <= 1001);
    assert.deepEqual(consoleMessages.filter(m => m.type === 'pageerror'), []);
    console.log('PASS: report editor shared shell, visual layout, collapsible panels, property tabs, shared real barcode SVG, barcode format updates, add/delete/drag, typography, page bounds, physical PDF pagination, print event, barcode text, rename, concurrent edits (create/update), save failure, draft confirmation and migration HTML snapshot.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
