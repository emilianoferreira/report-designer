const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const origin = 'http://review.test';
const dist = 'dist/zureo-report-designer/browser/';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="blue"/></svg>';

function fixture(width, imageUrl) {
  const row = JSON.parse(fs.readFileSync('e2e/stage0/fixtures/report-a4.json', 'utf8'));
  row.id = 'prepared-report';
  const template = row.template_json.template;
  const thermal = width !== 210;
  Object.assign(template.page, { paperType: thermal ? 'ticket-' + width : 'a4', width,
    height: thermal ? 200 : 297, dynamicHeight: thermal, margins: { top: 3, right: 3, bottom: 3, left: 3 } });
  const text = template.sections.header.elements.find(element => element.type === 'text');
  const image = template.sections.header.elements.find(element => element.type === 'image');
  Object.assign(template.sections.header, { height: 18, elements: [{
    ...text, position: { x: 1, y: 1 }, size: { width: 42, height: 8 }, content: 'Encabezado de prueba'
  }, ...(imageUrl ? [{ ...image, position: { x: 1, y: 9 }, size: { width: 12, height: 6 },
    source: { type: 'static', url: imageUrl } }] : [])] });
  Object.assign(template.sections.detail, { height: 0, elements: [], maxRowsPerPage: 8, showColumnHeaders: true });
  Object.assign(template.sections.footer, { height: 12, elements: [{
    ...text, id: 'closing-total', type: 'dataField', binding: { source: 'Total' },
    position: { x: 1, y: 1 }, size: { width: 40, height: 8 }
  }] });
  return row;
}

async function openPreview(page, row, handleImage) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: async text => { window.copiedHtml = text; } }
    });
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/auth/session') return route.fulfill({ json: {
      user: { id: 'review', email: 'review@example.test' }, company_id: row.company_id,
      role: 'editor', csrf_token: 'token', companies: []
    } });
    if (url.pathname === '/api/templates') return route.fulfill({ json: [row] });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404 });
    if (url.pathname === '/report-image.svg') return handleImage(route);
    const name = url.pathname.split('/').pop();
    const asset = /^[\w.-]+\.(js|css|ico)$/.test(name) ? name : 'index.html';
    return route.fulfill({ path: dist + asset });
  });
  await page.goto(origin + '/designer/' + row.id);
  await page.getByRole('button', { name: 'Vista Previa', exact: true }).click();
}

const button = (page, name) => page.getByRole('button', { name, exact: true });
const viewButton = (page, name) => page.locator('.toolbar-group').filter({ hasText: 'Vista:' })
  .getByRole('button', { name, exact: true });
const scenarioSelect = page => page.getByLabel('Escenario de impresión', { exact: true });
const outputOptions = page => page.locator('app-preview .output-options');
async function openOutputOptions(page) {
  if (await outputOptions(page).getAttribute('open') === null) {
    await outputOptions(page).locator('summary').click();
  }
}
const downloadButton = page => page.getByTitle('Descargar HTML con datos resueltos', { exact: true });
const copyButton = page => page.getByTitle('Copiar HTML con datos resueltos al portapapeles', { exact: true });

async function checkTicketDescriptions(page, browser, width) {
  const cases = [
    { name: 'Arroz', multiline: false },
    { name: 'Artículo de prueba con descripción extensa y varias palabras para comprobar el ancho del papel '.repeat(3).trim(), multiline: true },
    { name: 'ABCDEFGHIJ'.repeat(12), multiline: true }
  ];
  const preview = page.frameLocator('iframe[title="Vista previa"]');
  let shortHeight;
  for (const { name, multiline } of cases) {
    await button(page, 'Diseño').click();
    await page.locator('app-design-validation input[type="file"]').setInputFiles({
      name: 'ticket-description.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ invoice: {}, company: {}, Total: 122, isImpIncluidos: true,
        invoiceLines: [{ Articulo: { Codigo: 'T01', Nombre: name }, Cantidad: 1, PrecioUnitario: 122, SubTotal: 122 }] }))
    });
    await button(page, 'Vista Previa').click();
    await expect(scenarioSelect(page)).toHaveValue('json');
    await expect(page.locator('#report-output-summary')).toContainText('JSON importado · 1 artículo');
    await expect(downloadButton(page)).toBeEnabled();
    const description = preview.locator('.ticket-item-name');
    await expect(description).toHaveText('(T01) ' + name);
    await expect(preview.locator('.ticket-item-subtotal')).toContainText('122');
    const layout = await description.evaluate(node => {
      function fragments(element) {
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(element);
        return [...range.getClientRects()];
      }
      const item = node.closest('.ticket-item');
      const detail = item.closest('.section-detail').getBoundingClientRect();
      const footer = item.closest('.page').querySelector('.section-footer').getBoundingClientRect();
      const lines = fragments(node);
      const amount = item.querySelector('.ticket-item-subtotal');
      const withinDetail = rect => rect.left >= detail.left - 0.5 && rect.right <= detail.right + 0.5;
      return {
        lineCount: new Set(lines.map(rect => rect.top)).size,
        descriptionFits: lines.length > 0 && lines.every(withinDetail),
        amountFits: fragments(amount).every(withinDetail),
        amountBelowDescription: amount.getBoundingClientRect().top >= node.getBoundingClientRect().bottom - 0.5,
        footerBelowItem: footer.top >= item.getBoundingClientRect().bottom - 0.5
      };
    });
    assert.equal(layout.descriptionFits, true, 'Description fits the printable width at ' + width + ' mm');
    assert.equal(layout.lineCount > 1, multiline);
    assert.ok(layout.amountFits && layout.amountBelowDescription, 'The amount fits below the description');
    assert.ok(layout.footerBelowItem, 'The footer follows the expanded item');
    const height = await compareOutputs(page, browser, width, 'HTML', 1);
    if (multiline) assert.ok(height > shortHeight, 'Roll height grows with the description');
    else shortHeight = height;
  }
}

async function compareOutputs(page, browser, width, view, articles) {
  await viewButton(page, view).click();
  const preview = page.frameLocator('iframe[title="Vista previa"]');
  const rows = width === 210 ? '.detail-table tbody tr' : '.ticket-item';
  await expect(preview.locator(rows)).toHaveCount(articles);
  const summary = page.locator('#report-output-summary');
  const pages = width === 210 && articles === 15 ? 2 : 1;
  await expect(summary).toContainText(articles + (articles === 1 ? ' artículo' : ' artículos'));
  await expect(summary).toContainText(width === 210 ? 'A4 210 × 297 mm' : 'Ticket ' + width + ' mm');
  await expect(summary).toContainText(pages + (pages === 1 ? ' página' : ' páginas'));
  await openOutputOptions(page);
  await expect(downloadButton(page)).toBeEnabled();

  const download = page.waitForEvent('download');
  await downloadButton(page).click();
  const downloaded = fs.readFileSync(await (await download).path(), 'utf8');
  await page.evaluate(() => { window.copiedHtml = undefined; });
  await copyButton(page).click();
  await expect.poll(() => page.evaluate(() => window.copiedHtml)).toBe(downloaded);
  if (view === 'HTML') {
    assert.equal(await page.locator('.raw-block').textContent(), downloaded);
  }

  await preview.locator('html').evaluate(node => {
    const frameWindow = node.ownerDocument.defaultView;
    frameWindow.printedHtml = undefined;
    frameWindow.print = () => { frameWindow.printedHtml = '<!DOCTYPE html>\n' + node.outerHTML; };
  });
  await button(page, 'Imprimir prueba').click();
  await expect.poll(() => preview.locator('html').evaluate(node => node.ownerDocument.defaultView.printedHtml))
    .toBe(downloaded);
  await expect(preview.locator('body > .page')).toHaveCount(pages);
  await expect(preview.locator('[data-render-element="closing-total"]')).toHaveCount(1);
  await expect(preview.locator('.page').last().locator('[data-render-element="closing-total"]'))
    .toContainText(articles === 1 ? '122' : '28560');
  if (width === 210) {
    await expect(preview.locator('thead')).toHaveCount(pages);
    assert.deepEqual(await preview.locator('body > .page').evaluateAll(nodes =>
      nodes.map(node => node.querySelectorAll('tbody > tr').length)), articles === 15 ? [8, 7] : [1]);
  }
  const pdfPage = await browser.newPage();
  try {
    await pdfPage.setContent(downloaded);
    const pdf = (await pdfPage.pdf({ preferCSSPageSize: true })).toString('latin1');
    const boxes = [...pdf.matchAll(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/g)];
    assert.equal(boxes.length, pages);
    const height = width === 210 ? 297 : Number(
      /<style data-roll-paper-size="">@page \{ size: [\d.]+mm ([\d.]+)mm/.exec(downloaded)?.[1]);
    for (const [, pdfWidth, pdfHeight] of boxes) {
      assert.ok(Math.abs(Number(pdfWidth) * 25.4 / 72 - width) < 0.6, 'PDF width matches the selected paper');
      assert.ok(Math.abs(Number(pdfHeight) * 25.4 / 72 - height) < 0.6, 'PDF height matches preparation');
    }
    return height;
  } finally {
    await pdfPage.close();
  }
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [210, 58, 80]) {
      const page = await browser.newPage();
      await openPreview(page, fixture(width));
      await expect(page.locator('#report-output-summary')).toContainText('Versión guardada');
      await expect(scenarioSelect(page).locator('option[value="json"]')).toBeDisabled();
      await compareOutputs(page, browser, width, 'Render', 1);
      await viewButton(page, 'HTML').click();
      const scenarios = scenarioSelect(page);
      await scenarios.focus();
      await scenarios.press('ArrowDown');
      await scenarios.press('ArrowDown');
      await expect(scenarios).toHaveValue('fifteen');
      const longHeight = await compareOutputs(page, browser, width, 'HTML', 15);
      await viewButton(page, 'JSON').click();
      await scenarios.selectOption('single');
      const shortHeight = await compareOutputs(page, browser, width, 'JSON', 1);
      if (width !== 210) {
        assert.ok(longHeight > shortHeight);
        await checkTicketDescriptions(page, browser, width);
        console.log('PASS: short, long and unbroken descriptions fit ' + width + ' mm tickets.');
      } else {
        await scenarios.selectOption('fiscal-multi');
        await expect(page.locator('#report-output-summary')).toContainText('CFE ficticio · 5 artículos');
        await button(page, 'Diseño').click();
        await expect(page.getByLabel('Escenario de validación')).toHaveValue('fiscal-multi');
        const height = page.locator('#report-section-height');
        await height.fill('19');
        await height.press('Tab');
        await button(page, 'Vista Previa').click();
        await expect(scenarios).toHaveValue('fiscal-multi');
        await expect(page.locator('#report-output-summary')).toContainText('Borrador con cambios sin guardar');
      }
      await page.close();
      console.log('PASS: print, download and clipboard HTML match; PDF verified for ' + width + ' mm.');
    }

    const groupedPage = await browser.newPage();
    const grouped = fixture(210);
    grouped.template_json.template.sections.detail.groupBy = 'Articulo.Codigo';
    await openPreview(groupedPage, grouped);
    await compareOutputs(groupedPage, browser, 210, 'Render', 1);
    await viewButton(groupedPage, 'HTML').click();
    await scenarioSelect(groupedPage).selectOption('fifteen');
    await expect(groupedPage.getByText(/Saltos de página pendientes/)).toBeVisible();
    await expect(groupedPage.locator('.raw-block')).toHaveCount(0);
    for (const view of ['HTML', 'JSON', 'Render']) {
      await viewButton(groupedPage, view).click();
      await expect(button(groupedPage, 'Imprimir prueba')).toBeDisabled();
      await expect(downloadButton(groupedPage)).toBeDisabled();
      await expect(copyButton(groupedPage)).toBeDisabled();
    }
    await scenarioSelect(groupedPage).selectOption('single');
    await compareOutputs(groupedPage, browser, 210, 'HTML', 1);
    await groupedPage.close();
    console.log('PASS: grouped A4 blocks print, download and copy while pagination is pending.');

    const page = await browser.newPage();
    let releaseImage;
    const pendingImage = new Promise(resolve => { releaseImage = resolve; });
    let fail = true;
    await openPreview(page, fixture(80, origin + '/report-image.svg'), async route => {
      await pendingImage;
      return route.fulfill(fail ? { status: 503 } :
        { body: svg, contentType: 'image/svg+xml', headers: { 'Cache-Control': 'no-store' } });
    });
    await viewButton(page, 'HTML').click();
    await scenarioSelect(page).selectOption('fifteen');
    await scenarioSelect(page).selectOption('single');
    await openOutputOptions(page);
    await expect(downloadButton(page)).toBeDisabled();
    await expect(copyButton(page)).toBeDisabled();
    releaseImage();
    await expect(button(page, 'Reintentar preparación')).toBeVisible();
    await expect(page.locator('.raw-block')).toHaveCount(0);
    await expect(downloadButton(page)).toBeDisabled();
    await expect(copyButton(page)).toBeDisabled();
    fail = false;
    await button(page, 'Reintentar preparación').click();
    await compareOutputs(page, browser, 80, 'HTML', 1);
    await page.close();
    console.log('PASS: slow and failed image blocks stale HTML; retry uses the latest scenario.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
