const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 for(const format of ['report-a4','report-ticket-80','report-ticket-58']){
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const fixture = format === 'report-ticket-58' ? 'report-ticket-80' : format;
  const row={...JSON.parse(fs.readFileSync('e2e/stage0/fixtures/'+fixture+'.json','utf8')),id:format};
  if (format === 'report-ticket-58') {
    row.nombre = 'Contrato ticket 58';
    Object.assign(row.template_json.template.page, { paperType: 'ticket-58', width: 58 });
  }
  await page.route('**/*',route=>{
   const url=new URL(route.request().url()),p=url.pathname;
   if(url.hostname!=='review.test')return route.abort();
   if(p==='/api/auth/session')return route.fulfill({json:{user:{id:'review',email:'review@example.test'},company_id:row.company_id,role:'editor',csrf_token:'token',companies:[]}});
   if(p==='/api/templates')return route.fulfill({json:[row]});
   if(p.startsWith('/api/'))return route.fulfill({status:404,json:{}});
   const name=p.split('/').pop(),asset=/^[\w.-]+\.(js|css|ico)$/.test(name)?name:'index.html';
   return route.fulfill({body:fs.readFileSync('dist/zureo-report-designer/browser/'+asset),contentType:asset.endsWith('.js')?'application/javascript':asset.endsWith('.css')?'text/css':'text/html'});
  });
  await page.goto('http://review.test/templates');
  const card = page.locator('.mold-card').filter({ has: page.getByRole('heading', { name: row.nombre, exact: true }) });
  const paper = row.template_json.template.page;
  await expect(card).toContainText(format === 'report-a4' ? 'A4 210 × 297 mm' : `Ticket ${paper.width} mm`);
  await card.getByRole('button', { name: 'Editar', exact: true }).press('Enter');
  const paperSelect = page.getByLabel('Papel', { exact: true });
  await expect(paperSelect).toHaveValue(paper.paperType);
  await paperSelect.focus();
  await expect(paperSelect).toBeFocused();
  if (format === 'report-a4') {
    await page.locator('.element-wrapper').first().click();
    const x = page.getByLabel('X (mm)', { exact: true });
    await expect(x).toHaveAccessibleDescription('X e Y se miden desde la esquina superior izquierda de la sección.');
    const originalX = Number(await x.inputValue());
    await x.fill(String(originalX + 1));
    await x.press('Tab');
    await page.getByRole('button', { name: 'Ajustar a grilla', exact: true }).press('Control+z');
    await expect(x).toHaveValue(String(originalX));
  }
  await page.getByRole('button',{name:'Vista Previa',exact:true}).click();
  const preview=page.frameLocator('iframe[title="Vista previa"]');
  await expect(preview.locator('body')).toContainText('Mi Empresa S.A.');
  const scenario=page.getByLabel('Escenario de impresión',{exact:true});
  await scenario.selectOption('multi');
  await expect(preview.locator(format==='report-a4'?'.detail-table tbody tr':'.ticket-item')).toHaveCount(5);
  const html=await preview.locator('html').evaluate(el=>el.outerHTML);
  assert.ok(!html.includes('Diagnóstico por artículo'));assert.ok(!html.includes('QR Error'));
  if(format!=='report-a4')assert.ok(html.includes('size: auto;'));
  await page.getByText('Descargar o copiar',{exact:true}).click();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'HTML z-code',exact:true}).first().click();
  const exported=fs.readFileSync(await (await download).path(),'utf8');assert.ok(exported.includes('z-code="true"'));
  await scenario.selectOption('fifteen');
  const rows=preview.locator(format==='report-a4'?'.detail-table tbody tr':'.ticket-item');
  await expect(rows).toHaveCount(15);
  await expect(page.locator('#report-output-summary')).toContainText('Ejemplo histórico · 15 artículos');
  await scenario.selectOption('single');
  await expect(rows).toHaveCount(1);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: A4 and 58/80 mm catalog and preview, coordinate edit and undo, and Zureo HTML export.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
