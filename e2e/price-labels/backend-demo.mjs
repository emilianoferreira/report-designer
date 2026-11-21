import { chromium, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { runIsolatedApi } from './concurrency-api.mjs';
import { login, call } from '../stage8/check-security.mjs';
process.env.LabelPrinting__Provider = 'Demo';
await runIsolatedApi({verify: async ({urls,users}) => {
  const url=urls[1];
  const alice=await login(url,users.alice), bob=await login(url,users.bob), viewer=await login(url,users.viewer);
  for(const route of ['context','price-lists','articles']) await call(url,null,'GET','/api/label-print/'+route,undefined,401);
  await call(url,null,'POST','/api/label-print/resolve',{},401);
  const context=await call(url,viewer,'GET','/api/label-print/context'); assert.equal(context.mode,'demo');
  const lists=await call(url,viewer,'GET','/api/label-print/price-lists'); assert.equal(lists.items.length,2);
  assert.deepEqual(lists.items.map(x=>x.name),['Principal','Mayorista']);
  assert.ok(context.company.logo.startsWith('data:image/svg+xml'));
  const list=lists.items[0].id;
  const page=await call(url,viewer,'GET','/api/label-print/articles?query=DEMO-&priceListId='+encodeURIComponent(list));
  assert.equal(page.items.length,25); assert.ok(page.nextCursor);
  const next=await call(url,viewer,'GET','/api/label-print/articles?query=DEMO-&priceListId='+encodeURIComponent(list)+'&cursor='+encodeURIComponent(page.nextCursor));
  assert.equal(next.items.length,5); assert.notEqual(page.items[0].articleId,next.items[0].articleId);
  const body={priceListId:list,articleIds:page.items.slice(0,3).map(x=>x.articleId)};
  const result=await call(url,viewer,'POST','/api/label-print/resolve',body);
  assert.equal(result.items[1].price.amount,'58.00'); assert.ok(result.resolvedAt);
  const wholesale=await call(url,viewer,'POST','/api/label-print/resolve',{...body,priceListId:lists.items[1].id});
  assert.deepEqual(wholesale.items.map(x=>x.price.amount),['52.00','46.00','95.00']);
  await call(url,viewer,'POST','/api/label-print/resolve',body,403,{'X-CSRF-Token':''});
  await call(url,viewer,'POST','/api/label-print/resolve',body,403,{'Sec-Fetch-Site':'cross-site'});
  await call(url,bob,'POST','/api/label-print/resolve',body,404);
  const bobList=(await call(url,bob,'GET','/api/label-print/price-lists')).items[0].id;
  const foreign=await call(url,bob,'POST','/api/label-print/resolve',{...body,priceListId:bobList});
  assert.ok(foreign.items.every(x=>x.status==='unavailable' && x.article===null));
  await call(url,alice,'POST','/api/label-print/resolve',{...body,articleIds:[]},400);
  await call(url,alice,'POST','/api/label-print/resolve',{...body,articleIds:[body.articleIds[0],body.articleIds[0]]},400);
  await call(url,alice,'GET','/api/label-print/price-lists?pageSize=101',undefined,400);
  await call(url,alice,'GET','/api/label-print/price-lists?cursor=invalid',undefined,400);
  // Exercise compiled Angular against the real isolated API and demo catalog.
  const mold=JSON.parse(readFileSync('e2e/stage0/fixtures/price-label.json','utf8'));
  mold.template_json.label.gapX=0;
  for(const element of mold.template_json.elements) if(element.type==='barcode')element.barcodeType='EAN13';
  const saved=await call(url,alice,'POST','/api/templates',mold,201);
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const ui=await browser.newPage();
    await ui.route('**/*',async route=>{
      const request=route.request(),target=new URL(request.url());
      if(target.hostname!=='review.test')return route.abort();
      if(target.pathname.startsWith('/api/')){
        const response=await fetch(url+target.pathname+target.search,{method:request.method(),headers:{cookie:viewer.cookie,'X-CSRF-Token':viewer.session.csrf_token,'Content-Type':'application/json'},...(request.postData()?{body:request.postData()}: {})});
        return route.fulfill({status:response.status,contentType:response.headers.get('content-type')||'application/json',body:await response.text()});
      }
      const name=target.pathname.split('/').pop(),asset=/^[\w.-]+\.(js|css|ico)$/.test(name)?name:'index.html';
      return route.fulfill({body:readFileSync('dist/zureo-report-designer/browser/'+asset),contentType:asset.endsWith('.js')?'application/javascript':asset.endsWith('.css')?'text/css':'text/html'});
    });
    await ui.goto('http://review.test/price-labels/print');
    await ui.getByLabel('Molde guardado').selectOption(saved.id);
    await ui.getByLabel('Lista de precios').selectOption({label:'Principal'});
    await ui.getByLabel('Buscar por código o código de barras').fill('DEMO-');
    await ui.getByRole('button',{name:'Buscar',exact:true}).click();
    const names=['Arroz blanco 1 kg','Azúcar blanca 1 kg','Aceite de girasol 900 ml'];
    for(let i=0;i<3;i++){
      await ui.getByRole('button',{name:'Agregar DEMO-00'+(i+1),exact:true}).click();
      const input=ui.getByLabel('Cantidad de '+names[i],{exact:true});await input.fill(String([2,5,1][i]));await input.press('Tab');
    }
    await expect(ui.getByRole('button',{name:'Imprimir',exact:true})).toBeEnabled();
    await expect(ui.frameLocator('iframe').locator('.label-cell')).toHaveCount(8);
    await expect(ui.frameLocator('iframe').locator('.label-price').first()).toContainText('65,00');
    await ui.getByLabel('Lista de precios').selectOption({label:'Mayorista'});
    await expect(ui.frameLocator('iframe').locator('.label-price').first()).toContainText('52,00');
    await expect(ui.getByRole('heading',{name:'Lote · 8 / 100 etiquetas'})).toBeVisible();
    await ui.evaluate(()=>{window.demoPrints=0;document.querySelector('iframe').contentWindow.print=()=>window.demoPrints++;});
    await ui.getByRole('button',{name:'Imprimir',exact:true}).click();
    await expect.poll(()=>ui.evaluate(()=>window.demoPrints)).toBe(1);
    const downloaded=ui.waitForEvent('download');await ui.getByRole('button',{name:'Exportar HTML',exact:true}).click();
    const html=readFileSync(await (await downloaded).path(),'utf8');
    assert.ok(html.includes('data:image/svg+xml'));assert.ok(html.includes('52,00'));assert.ok(html.includes('<svg'));
    console.log('PASS: compiled UI + real demo API, default image mold, EAN13, quantities, list switch, print and HTML export.');
  }finally{await browser.close();}
  await call(url,alice,'POST','/api/auth/logout',undefined,204);
  await call(url,alice,'POST','/api/label-print/resolve',body,401);
  console.log('PASS: label demo HTTP contracts, viewer, CSRF, pagination, company isolation and revoked session.');
}});
