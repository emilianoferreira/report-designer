const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage();
    const fixture = JSON.parse(fs.readFileSync('e2e/stage0/fixtures/price-label.json','utf8'));
    fixture.id = 'e0000000-0000-4000-8000-000000000012';
    fixture.template_json.label.gapX = 0;
    fixture.template_json.label.rows = 2;
    fixture.template_json.label.columns = 2;
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'review.test') return route.abort();
      if (url.pathname === '/api/auth/session') return route.fulfill({json:{user:{id:'demo',email:'demo@example.test'},company_id:fixture.company_id,role:'viewer',csrf_token:'demo',companies:[]}});
      if (url.pathname === '/api/templates') return route.fulfill({json:[fixture]});
      if (url.pathname.startsWith('/api/')) return route.fulfill({status:404});
      const name = url.pathname.split('/').pop();
      const asset = /^[\w.-]+\.(js|css|ico)$/.test(name) ? name : 'index.html';
      return route.fulfill({body:fs.readFileSync(`dist/zureo-report-designer/browser/${asset}`),contentType:asset.endsWith('.js')?'application/javascript':asset.endsWith('.css')?'text/css':'text/html'});
    });
    await page.goto('http://review.test/price-labels/print');
    await page.getByLabel('Molde guardado').selectOption(fixture.id);
    const names = ['Teclado mecanico Logitech','Cable HDMI 2m','Mouse inalambrico'];
    for (const name of names) await page.getByRole('button',{name:`${name} · Agregar`,exact:true}).click();
    for (let i=0;i<3;i++) {
      const input = page.getByLabel(`Cantidad de ${names[i]}`,{exact:true});
      await input.fill(String([2,5,1][i])); await input.press('Tab');
    }
    await expect(page.getByRole('heading',{name:'Lote · 8 / 100 etiquetas'})).toBeVisible();
    await expect(page.frameLocator('iframe').locator('.label-cell')).toHaveCount(8);
    await expect(page.frameLocator('iframe').locator('.page')).toHaveCount(2);
    await expect(page.getByLabel('Copias por articulo')).toHaveCount(0);
    const input = page.getByLabel(`Cantidad de ${names[0]}`,{exact:true});
    await input.fill('100'); await input.press('Tab');
    await expect(input).toHaveValue('2');
    await expect(page.getByRole('alert')).toContainText('100');
    await page.getByRole('button',{name:'Eliminar',exact:true}).first().click();
    await expect(page.getByRole('heading',{name:'Lote · 6 / 100 etiquetas'})).toBeVisible();
    await expect(page.frameLocator('iframe').locator('.label-cell')).toHaveCount(6);
    console.log('PASS: viewer demo batch, saved mold, individual quantities, eight labels/two pages, overflow recovery and removal.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
