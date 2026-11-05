import { Page } from '@playwright/test';
import { test, expect, fixture, createTemplate, deleteTemplate, assertStored, stableJson } from '../support';

async function loadFromApi(page: Page, route: string) {
  const loaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/templates' && response.request().method() === 'GET');
  await page.goto(route);
  expect((await loaded).status()).toBe(200);
  expect(await page.evaluate(() => localStorage.getItem('zureo_template_molds'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('zureo_price_label_templates'))).toBeNull();
}

async function openReport(page: Page, id: string, name: string) {
  // Enter through the list: direct /designer/:id startup currently has an async loading race.
  await loadFromApi(page, '/templates');
  const card = page.locator('.mold-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/designer/${id}$`));
}

for (const fixtureName of ['report-a4', 'report-ticket-80']) {
  test(`${fixtureName}: UI save → PostgreSQL → fresh browser → preview and exports`, async ({ api, db, browser, page }) => {
    const created = await createTemplate(api, fixtureName, ' UI');
    let fresh;
    try {
      const initial = fixture(fixtureName).template_json.template.sections.header.elements[0].content;
      const editedText = `Guardado ${fixtureName} áé 1,25`;
      await openReport(page, created.id, created.nombre);
      await page.locator('.element-wrapper').filter({ has: page.locator('.text-element').filter({ hasText: initial }) }).click();
      await page.locator('app-properties-panel').getByRole('button', { name: 'Datos', exact: true }).click();
      const text = page.locator('app-properties-panel textarea').first();
      await text.fill(editedText);
      await text.press('Tab');
      const save = page.getByRole('button', { name: 'Guardar', exact: true });
      await expect(save).toBeEnabled();
      const savedResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/templates/${created.id}/design` && response.request().method() === 'PUT');
      await save.click();
      const response = await savedResponse;
      expect(response.status()).toBe(200);
      const sent = response.request().postDataJSON().template_json;
      const saved = await response.json();
      expect(saved.template_json).toEqual(sent);
      expect(saved.version).toBe(2);
      expect(sent.template.sections.header.elements[0].content).toBe(editedText);
      expect(sent.template.futureExtension).toEqual(fixture(fixtureName).template_json.template.futureExtension);
      expect(sent.template.sections.header.elements[0].position).toEqual({ x: 1.25, y: 2.75 });
      expect(sent.template.sections.header.elements[0].futureElementProperty).toEqual({ keep: true });
      await assertStored(db, api, created.id, sent);
      await expect(save).toBeDisabled();

      fresh = await browser.newContext({ storageState: process.env['STAGE8_STORAGE_STATE'], baseURL: process.env['STAGE0_UI_URL'], locale: 'es-UY', timezoneId: 'America/Montevideo', viewport: { width: 1600, height: 1000 } });
      const reloaded = await fresh.newPage();
      await openReport(reloaded, created.id, created.nombre);
      await expect(reloaded.locator('.text-element').filter({ hasText: editedText })).toBeVisible();
      await reloaded.getByRole('button', { name: 'Vista Previa', exact: true }).click();
      const preview = reloaded.frameLocator('iframe[title="Vista previa"]');
      await expect(preview.locator('body')).toContainText(editedText);
      await expect(preview.locator('body')).toContainText('Mi Empresa S.A.');
      if (fixtureName === 'report-a4') {
        await expect(preview.locator('.element-qrcode svg')).toHaveCount(1);
        await expect(preview.locator('.element-barcode svg')).toHaveCount(1);
        await expect(preview.locator('.detail-table tbody tr')).toHaveCount(1);
      } else {
        await expect(preview.locator('.ticket-item')).toHaveCount(1);
      }
      await reloaded.getByRole('button', { name: '1 artículo', exact: true }).click();
      await expect(preview.locator(fixtureName === 'report-a4' ? '.detail-table tbody tr' : '.ticket-item')).toHaveCount(5);
      // Compare actual generated HTML, including geometry, bindings, formula, SVG and print CSS.
      const html = await preview.locator('html').evaluate(element => element.outerHTML);
      expect(html).not.toContain('QR Error');
      expect(html).not.toContain('Barcode Error');
      expect(html).not.toContain('[Error:');
      expect(html).toMatchSnapshot(`${fixtureName}-preview.html`);
      await reloaded.locator('.toolbar-group').filter({ hasText: 'Vista:' }).getByRole('button', { name: 'JSON', exact: true }).click();
      const exported = JSON.parse(await reloaded.locator('pre.raw-block').innerText());
      expect(exported).toEqual(sent.template);
      expect(stableJson(exported)).toMatchSnapshot(`${fixtureName}-saved-design.json`);
      const downloadEvent = reloaded.waitForEvent('download');
      await reloaded.getByRole('button', { name: 'HTML z-code', exact: true }).first().click();
      const download = await downloadEvent;
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
      const zureo = Buffer.concat(chunks).toString('utf8');
      expect(zureo).toContain('z-code="true"');
      expect(zureo).toContain(editedText);
      expect(zureo).toMatchSnapshot(`${fixtureName}-zureo.html`);
    } finally {
      await fresh?.close();
      await deleteTemplate(api, created.id);
    }
  });
}

test('price labels: UI save → PostgreSQL → fresh browser → render copies and export', async ({ api, db, browser, page }) => {
  const created = await createTemplate(api, 'price-label', ' UI');
  let fresh;
  try {
    await loadFromApi(page, '/price-labels');
    await expect(page.locator(`.template-select option[value="${created.id}"]`)).toHaveCount(1);
    await page.locator('.template-menu summary').click();
    await page.locator('.template-select').selectOption(created.id);
    await page.locator('app-price-label-canvas .text-content').filter({ hasText: 'Texto inicial etiqueta' }).click();
    await page.locator('app-price-label-properties').getByRole('button', { name: 'Datos', exact: true }).click();
    const text = page.getByRole('textbox', { name: 'Texto fijo', exact: true });
    await text.fill('Etiqueta guardada ñ 1,25');
    await text.press('Tab');
    const savedResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/templates/${created.id}/design` && response.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    const response = await savedResponse;
    expect(response.status()).toBe(200);
    const sent = response.request().postDataJSON().template_json;
    expect((await response.json()).template_json).toEqual(sent);
    expect(sent.type).toBe('price-label');
    expect(sent.futureExtension).toEqual(fixture('price-label').template_json.futureExtension);
    expect(sent.elements.find((element: any) => element.type === 'text').content).toBe('Etiqueta guardada ñ 1,25');
    await assertStored(db, api, created.id, sent);

    fresh = await browser.newContext({ storageState: process.env['STAGE8_STORAGE_STATE'], baseURL: process.env['STAGE0_UI_URL'], locale: 'es-UY', timezoneId: 'America/Montevideo', viewport: { width: 1600, height: 1000 } });
    const reloaded = await fresh.newPage();
    await loadFromApi(reloaded, '/price-labels');
    await expect(reloaded.locator(`.template-select option[value="${created.id}"]`)).toHaveCount(1);
    await reloaded.locator('.template-menu summary').click();
    await reloaded.locator('.template-select').selectOption(created.id);
    await reloaded.getByRole('button', { name: 'Vista previa', exact: true }).click();
    const preview = reloaded.frameLocator('iframe[title="Vista previa de etiquetas"]');
    await expect(preview.locator('.label-cell')).toHaveCount(4);
    await expect(preview.locator('.label-text').first()).toHaveText('Etiqueta guardada ñ 1,25');
    await expect(preview.locator('.label-barcode svg')).toHaveCount(4);
    await expect(preview.locator('.label-price').first()).toContainText('4.200,00');
    await reloaded.getByLabel('Copias por articulo').fill('2');
    await reloaded.getByLabel('Copias por articulo').press('Tab');
    await expect(preview.locator('.label-cell')).toHaveCount(8);
    expect(await preview.locator('html').evaluate(element => element.outerHTML)).toMatchSnapshot('price-label-preview.html');
    await reloaded.getByRole('button', { name: 'JSON', exact: true }).click();
    const exported = JSON.parse(await reloaded.locator('pre').innerText());
    // Row identity/name override the internal JSON on load, as implemented today.
    expect(exported).toEqual({ ...sent, id: created.id, name: created.nombre });
    expect(stableJson({ ...exported, id: '<row-uuid>' })).toMatchSnapshot('price-label-saved-design.json');
  } finally {
    await fresh?.close();
    await deleteTemplate(api, created.id);
  }
});

test('report and price-label lists remain separated despite sharing the API', async ({ api, page }) => {
  const report = await createTemplate(api, 'report-a4', ' filter');
  const label = await createTemplate(api, 'price-label', ' filter');
  try {
    await loadFromApi(page, '/templates');
    await expect(page.getByRole('heading', { name: report.nombre, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: label.nombre, exact: true })).toHaveCount(0);
    await loadFromApi(page, '/price-labels');
    await expect(page.locator(`.template-select option[value="${label.id}"]`)).toHaveCount(1);
    await expect(page.locator(`.template-select option[value="${report.id}"]`)).toHaveCount(0);
  } finally {
    await deleteTemplate(api, report.id);
    await deleteTemplate(api, label.id);
  }
});
