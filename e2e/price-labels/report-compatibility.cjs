const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 for(const format of ['report-a4','report-ticket-80']){
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const row={...JSON.parse(fs.readFileSync('e2e/stage0/fixtures/'+format+'.json','utf8')),id:format};
  await page.route('**/*',route=>{
   const url=new URL(route.request().url()),p=url.pathname;
   if(url.hostname!=='review.test')return route.abort();
   if(p==='/api/auth/session')return route.fulfill({json:{user:{id:'review',email:'review@example.test'},company_id:row.company_id,role:'editor',csrf_token:'token',companies:[]}});
   if(p==='/api/templates')return route.fulfill({json:[row]});
   if(p.startsWith('/api/'))return route.fulfill({status:404,json:{}});
   const name=p.split('/').pop(),asset=/^[\w.-]+\.(js|css|ico)$/.test(name)?name:'index.html';
   return route.fulfill({body:fs.readFileSync('dist/zureo-report-designer/browser/'+asset),contentType:asset.endsWith('.js')?'application/javascript':asset.endsWith('.css')?'text/css':'text/html'});
  });
  await page.goto('http://review.test/designer/'+format);await page.locator('app-design-canvas').waitFor();
  await page.getByRole('button',{name:'Vista Previa',exact:true}).click();
  const preview=page.frameLocator('iframe[title="Vista previa"]');
  await expect(preview.locator('body')).toContainText('Mi Empresa S.A.');
  const scenario=page.getByLabel('Escenario de impresión',{exact:true});
  await scenario.selectOption('multi');
  await expect(preview.locator(format==='report-a4'?'.detail-table tbody tr':'.ticket-item')).toHaveCount(5);
  const html=await preview.locator('html').evaluate(el=>el.outerHTML);
  assert.ok(!html.includes('Diagnóstico por artículo'));assert.ok(!html.includes('QR Error'));
  if(format==='report-ticket-80')assert.ok(html.includes('size: auto;'));
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
 console.log('PASS: A4 and 80 mm ticket preview, five articles and Zureo HTML export remain independent of label printing.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
