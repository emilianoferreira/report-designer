const { chromium, expect } = require('@playwright/test');
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
    let failList = false;
    let role = 'editor';
    let otherMolds = [];
    let deletions = 0;
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
        return route.fulfill({ json: { user: { id: 'review-user', email: 'review@example.test' }, company_id: fixture.company_id, role, csrf_token: 'review-token', expires_at: '2099-01-01T00:00:00Z', companies: [{ id: fixture.company_id, name: 'Review', role }] } });
      }
      if (path === '/api/templates' && route.request().method() === 'GET') return route.fulfill(failList ? {status:500,json:{}} : { json: [row, ...otherMolds] });
      if (path === '/api/templates/' + row.id && route.request().method() === 'GET') return route.fulfill({json:row});
      const revision = route.request().headers()['if-match'];
      if (revision && revision !== JSON.stringify(String(row.version))) return route.fulfill({status:409,json:{message:'Template revision conflict'}});
      if (path === '/api/templates/' + row.id && route.request().method() === 'DELETE' && !failSave) { deletions++; return route.fulfill({status:200,body:''}); }
      if (route.request().method() !== 'GET' && failSave) return route.fulfill({ status: 500, json: { message: 'Test save failure' } });
      if (path === '/api/templates' && route.request().method() === 'POST') {
        creations++;
        const sent = route.request().postDataJSON();
        row = { ...row, ...sent, id: 'e0000000-0000-4000-8000-' + String(98 + creations).padStart(12,'0'), version: 1 };
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
    async function newTemplate() { await openTemplateMenu(); await page.getByRole('button', { name: 'Nuevo molde', exact: true }).click(); }
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
    await expect(page.locator('#print-settings h2').first()).toHaveText('Perfil de hoja · Activo');
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
    await page.waitForFunction(() => document.querySelector('button.primary:not(:disabled):not([aria-disabled=true])'));
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
    await expect(page.getByRole('alert')).toHaveCount(1);
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
    await page.waitForFunction(() => document.querySelector('button.primary:not(:disabled):not([aria-disabled=true])'));
    assert.equal(await name.inputValue(), 'Edición durante creación');
    assert.equal(await page.locator('.template-select').inputValue(), row.id);
    failSave = true;
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.save-status')?.textContent.includes('No se pudo guardar'));
    assert.equal(await name.inputValue(), 'Edición durante creación');
    failSave = false; saveDelay = 0;
    const finalSave = page.waitForResponse(r => r.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click(); await finalSave;
    await page.waitForFunction(() => document.querySelector('button.primary:not(:disabled):not([aria-disabled=true])'));
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
    await page.getByRole('button', { name: 'Ajustar a grilla', exact: true }).click();
    await page.getByRole('button', { name: 'Ajustar a elementos', exact: true }).click();
    const x = page.getByLabel('X (mm)', { exact: true });
    await expect(x).toHaveAccessibleDescription('X e Y se miden desde la esquina superior izquierda de la etiqueta.');
    const beforeX = Number(await x.inputValue());
    const bar = await page.locator('.barcode-content').boundingBox();
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await page.mouse.down(); await page.mouse.move(bar.x + bar.width / 2 + 12, bar.y + bar.height / 2); await page.mouse.up();
    await page.waitForFunction(value => Number(document.querySelector('app-price-label-properties input[type=number]').value) > value, beforeX);
    assert.equal(await page.locator('.barcode-content svg').count(), 1);
    await page.screenshot({ path: 'tmp/labels-properties.png' });
    assert.deepEqual(consoleMessages.filter(m => m.type === 'pageerror'), []);
    await require('./precision.cjs')(page, newTemplate, openSettings);
    acceptDialog = true;
    await require('./validation.cjs')(page, newTemplate);
    await require('./presentation.cjs')(page, newTemplate);
    await newTemplate();
    const beforeConflictCreations = creations;
    await name.fill('Compartida'); await name.press('Tab');
    await page.getByRole('button',{name:'Guardar',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('button.primary:not(:disabled):not([aria-disabled=true])'));
    row = {...row, version:row.version+1, nombre:'Cambio remoto'};
    await name.fill('Mi borrador'); await name.press('Tab');
    await page.getByRole('button',{name:'Guardar',exact:true}).click();
    await page.getByRole('button',{name:'Guardar borrador como copia',exact:true}).waitFor();
    assert.equal(await name.inputValue(),'Mi borrador');
    await page.getByRole('button',{name:'Guardar borrador como copia',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('button.primary:not(:disabled):not([aria-disabled=true])'));
    assert.equal(await name.inputValue(),'Mi borrador (copia)');
    assert.equal(creations,beforeConflictCreations+2);
    row = {...row, version:row.version+1, nombre:'Versión remota'};
    await page.getByRole('button',{name:'Guardar',exact:true}).click();
    await page.getByRole('button',{name:'Recargar versión del servidor',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('.template-name-input').value==='Versión remota');
    acceptDialog=false;
    await openTemplateMenu(); await page.getByRole('button',{name:'Eliminar molde',exact:true}).click();
    assert.equal(deletions,0); assert.equal(await name.inputValue(),'Versión remota');
    acceptDialog=true; failSave=true;
    await openTemplateMenu(); await page.getByRole('button',{name:'Eliminar molde',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('.save-status').textContent.includes('No se pudo eliminar'));
    assert.equal(await name.inputValue(),'Versión remota'); assert.equal(deletions,0);
    failSave=false;
    row={...row,version:row.version+1};
    await openTemplateMenu(); await page.getByRole('button',{name:'Eliminar molde',exact:true}).click();
    await page.getByRole('button',{name:'Recargar versión del servidor',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('button.primary:not(:disabled):not([aria-disabled=true])'));
    await openTemplateMenu(); await page.getByRole('button',{name:'Eliminar molde',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('.save-status').textContent==='Eliminado');
    assert.equal(deletions,1);
    failList=true; await page.reload(); await page.getByRole('button',{name:'Reintentar carga',exact:true}).waitFor();
    failList=false; await page.getByRole('button',{name:'Reintentar carga',exact:true}).click();
    await page.getByRole('button',{name:'Reintentar carga',exact:true}).waitFor({state:'detached'});
    console.log('PASS: conflict preserves draft, save copy, reload revision, protected delete, failure recovery and catalog retry.');
    const validRow = JSON.parse(JSON.stringify(row));
    for (const corrupt of [t => { t.page = null; }, t => { t.elements[0].binding = 42; }]) {
      row = JSON.parse(JSON.stringify(validRow)); corrupt(row.template_json);
      await page.reload(); await page.locator('.price-content').waitFor();
      await name.fill('Borrador conservado'); await name.press('Tab');
      await selectSavedTemplate();
      await page.waitForFunction(() => document.querySelector('.save-status').textContent.includes('No se pudo abrir'));
      assert.equal(await name.inputValue(), 'Borrador conservado');
    }
    console.log('PASS: malformed templates rejected without replacing the draft.');
    // The shared shell still leaves the report editor usable beneath the session bar.
    row = { ...JSON.parse(fs.readFileSync('e2e/stage0/fixtures/report-a4.json', 'utf8')), id: 'e0000000-0000-4000-8000-000000000030', version: 1 };
    await page.goto('http://review.test/designer/' + row.id);
    await page.locator('app-design-canvas').waitFor();
    await page.screenshot({ path: 'tmp/reports-reference.png' });
    const reportBounds = await page.locator('app-designer-page').boundingBox();
    assert.ok(reportBounds.y + reportBounds.height <= 1001);
    assert.deepEqual(consoleMessages.filter(m => m.type === 'pageerror'), []);
    console.log('PASS: report editor shared shell, visual layout, collapsible panels, property tabs, shared real barcode SVG, barcode format updates, add/delete/drag, typography, page bounds, physical PDF pagination, print event, barcode text, rename, concurrent edits (create/update), save failure, draft confirmation and migration HTML snapshot.');

    await page.goto('http://review.test/templates');
    await expect(page.getByRole('heading', { name: row.nombre, exact: true })).toBeVisible();
    const reportName = row.nombre;
    otherMolds = [row];
    await page.getByRole('link', { name: 'Etiquetas', exact: true }).click();
    await expect(page.getByRole('heading', { name: reportName, exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: '+ Nuevo molde', exact: true }).click();
    await expect(page).toHaveURL(/\/price-labels\/new$/);
    const next = page.getByRole('button', { name: 'Continuar al editor', exact: true });
    await next.click();
    await expect(page.getByRole('alert')).toHaveText('Ingresá un nombre para el molde.');
    await page.getByLabel('Nombre del molde').fill('Etiqueta de biblioteca');
    const size = page.getByRole('combobox', { name: /^Tamaño de la etiqueta/ });
    await size.selectOption('custom');
    await page.getByLabel('Ancho (mm)', { exact: true }).fill('205');
    await next.click();
    await expect(page.getByRole('alert')).toContainText('superan el ancho útil');
    await size.selectOption('50x30');
    await page.getByRole('radio', { name: 'Hoja A4', exact: true }).check();
    await next.click();
    await expect(name).toHaveValue('Etiqueta de biblioteca');
    await expect(page.locator('.label-surface')).toBeFocused();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page).toHaveURL(/\/price-labels\/[^/]+\/edit$/);
    assert.equal(row.template_json.printProfiles, undefined);
    const editUrl = page.url();
    await page.reload();
    await expect(name).toHaveValue('Etiqueta de biblioteca');
    const originalSheet = structuredClone(row.template_json.page);
    const originalLabel = structuredClone(row.template_json.label);
    const originalElements = structuredClone(row.template_json.elements);
    await openSettings();
    await page.getByRole('button', { name: 'Agregar perfil térmico', exact: true }).click();
    await page.getByLabel('Ancho del rollo (mm)', { exact: true }).fill('55');
    await page.getByLabel('Ancho imprimible (mm)', { exact: true }).fill('54');
    await page.getByLabel('Tipo de rollo').selectOption('black-mark');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.locator('.save-status')).toHaveText('Guardado');
    assert.deepEqual(row.template_json.page, originalSheet);
    assert.deepEqual(row.template_json.label, originalLabel);
    assert.deepEqual(row.template_json.elements, originalElements);
    await page.reload();
    await openSettings();
    await expect(page.getByLabel('Ancho del rollo (mm)', { exact: true })).toHaveValue('55');
    await expect(page.getByLabel('Ancho imprimible (mm)', { exact: true })).toHaveValue('54');
    await expect(page.getByLabel('Tipo de rollo')).toHaveValue('black-mark');
    await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
    await page.getByLabel('Perfil de impresión').selectOption('thermal');
    await expect(page.frameLocator('iframe').locator('.page')).toHaveCount(4);
    await page.getByRole('button', { name: 'Volver a documentos', exact: true }).click();
    await expect(page).toHaveURL(/\/templates\/labels$/);
    await expect(page.getByRole('heading', { name: reportName, exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Reportes', exact: true }).click();
    await expect(page.getByRole('heading', { name: reportName, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Etiqueta de biblioteca', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Etiquetas', exact: true }).click();
    await expect(page.getByRole('heading', { name: reportName, exact: true })).toHaveCount(0);
    const card = page.getByRole('article').filter({ hasText: 'Etiqueta de biblioteca' });
    await card.getByRole('link', { name: 'Editar', exact: true }).click();
    await expect(page).toHaveURL(editUrl);
    await expect(name).toHaveValue('Etiqueta de biblioteca');
    row = { ...row, version: row.version + 1 };
    await name.fill('Borrador para imprimir'); await name.press('Tab');
    await page.getByRole('button', { name: 'Guardar y preparar impresión', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Guardar borrador como copia', exact: true })).toBeVisible();
    await expect(name).toHaveValue('Borrador para imprimir');
    await expect(page).toHaveURL(editUrl);
    await page.getByRole('button', { name: 'Recargar versión del servidor', exact: true }).click();
    await expect(name).toHaveValue('Etiqueta de biblioteca');
    await name.fill('Etiqueta actualizada'); await name.press('Tab');
    await page.getByRole('button', { name: 'Guardar y preparar impresión', exact: true }).click();
    await expect(page.getByLabel('Molde guardado')).toHaveValue(row.id);
    await page.reload();
    await expect(page.getByLabel('Molde guardado')).toHaveValue(row.id);

    await page.goto('http://review.test/price-labels/inexistente/edit');
    await expect(page.getByRole('alert')).toHaveText('No se encontró el molde de etiqueta.');
    role = 'viewer';
    await page.goto(editUrl);
    await expect(name).toHaveValue('Etiqueta actualizada');
    await expect(name).not.toBeEditable();
    await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Preparar impresión', exact: true }).click();
    await expect(page.getByLabel('Molde guardado')).toHaveValue(row.id);
    await page.getByRole('link', { name: '← Moldes de etiquetas', exact: true }).click();
    await expect(page.getByRole('link', { name: '+ Nuevo molde', exact: true })).toHaveCount(0);
    await page.getByRole('article').filter({ hasText: 'Etiqueta actualizada' }).getByRole('link', { name: 'Preparar impresión', exact: true }).click();
    await expect(page.getByLabel('Molde guardado')).toHaveValue(row.id);
    assert.deepEqual(consoleMessages.filter(m => m.type === 'pageerror'), []);
    console.log('PASS: library, label creation, direct links, save-and-print conflict and viewer printing.');

    role = 'editor';
    await page.goto('http://review.test/templates/labels');
    const previewFrame = page.frameLocator('iframe');
    const patternAt = index => previewFrame.locator('.label-image img').nth(index).evaluate(image => {
      const svg = decodeURIComponent(image.getAttribute('src').split(',')[1]);
      const artwork = new DOMParser().parseFromString(svg, 'image/svg+xml');
      return {
        marks: Array.from(artwork.querySelectorAll('path'), path => path.getAttribute('d')),
        text: Array.from(artwork.querySelectorAll('text'), item => item.textContent),
        bars: artwork.querySelectorAll('rect').length
      };
    });
    const configurations = [
      { name: 'Calibración A4 · hoja de control', size: '210mm 297mm', pages: 1, cells: 1, code: 'CAL-A4', mark: 'M 55 58 L 155 58' },
      { name: 'Calibración A4 · plancha 4 × 8', size: '210mm 297mm', pages: 1, cells: 32, code: 'F1C1', mark: 'M 2 1.1 L 2 2.9' },
      { name: 'Calibración térmica · 50 × 30 mm', size: '50mm 30mm', pages: 12, cells: 12, code: '2001234500012', mark: 'M 10 6 L 40 6' },
      { name: 'Calibración térmica · 60 × 40 mm', size: '60mm 40mm', pages: 12, cells: 12, code: '2001234500012', mark: 'M 10 6 L 50 6' }
    ];
    for (const format of configurations) {
      await page.locator('summary').filter({ hasText: 'Calibración' }).click();
      await page.getByRole('link', { name: format.name, exact: true }).click();
      await expect(page.getByRole('button', { name: 'Imprimir', exact: true })).toBeEnabled();
      await expect(previewFrame.locator('.page')).toHaveCount(format.pages);
      await expect(previewFrame.locator('.label-cell')).toHaveCount(format.cells);
      assert.ok((await previewFrame.locator('style').textContent()).includes('size: ' + format.size));
      const first = await patternAt(0);
      assert.ok(first.text.some(value => value.includes(format.code)));
      assert.ok(first.marks.includes(format.mark));
      assert.ok(first.bars > 10);
      if (format.cells === 32) assert.ok((await patternAt(31)).text.includes('F8C4'));
      if (format.pages === 12) {
        const codes = ['2001234500012', 'C02', '2001234500036', 'C04', '2001234500050', 'C06',
          '2001234500074', 'C08', '2001234500098', 'C10', '2001234500111', 'C12'];
        await expect(previewFrame.locator('.page').locator('.label-cell')).toHaveCount(12);
        for (const [index, code] of codes.entries()) assert.ok((await patternAt(index)).text.includes(code), code);
      }
      const exported = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Exportar HTML', exact: true }).click();
      const pdfPage = await browser.newPage();
      await pdfPage.setContent(fs.readFileSync(await (await exported).path(), 'utf8'));
      const pdf = (await pdfPage.pdf({ preferCSSPageSize: true })).toString('latin1');
      assert.equal((pdf.match(/\/Type \/Page\b/g) || []).length, format.pages, format.name);
      await pdfPage.close();
      await page.getByRole('button', { name: 'Volver a documentos', exact: true }).click();
    }
    await page.locator('summary').filter({ hasText: 'Calibración' }).click();
    await page.getByRole('link', { name: configurations[2].name, exact: true }).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page).toHaveURL(/\/price-labels\/[^/]+\/edit$/);
    assert.equal(row.template_json.calibration, 'thermal-50x30');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Imprimir', exact: true })).toBeEnabled();
    await expect(previewFrame.locator('.page')).toHaveCount(12);
    await page.evaluate(() => {
      const iframe = document.querySelector('iframe');
      const shown = iframe.contentDocument;
      iframe.contentWindow.print = () => {
        if (iframe.contentDocument !== shown) throw Error('Document replaced');
        window.calibrationPrintCount = shown.querySelectorAll('.page').length;
      };
    });
    await page.getByRole('button', { name: 'Imprimir', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.calibrationPrintCount)).toBe(12);
    assert.deepEqual(consoleMessages.filter(m => m.type === 'pageerror'), []);
    console.log('PASS: calibration presets, PDF reference marks and codes, thermal sequence and saved mold printing.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
