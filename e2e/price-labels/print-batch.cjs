const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 const page=await browser.newPage();
 const fixture=JSON.parse(fs.readFileSync('e2e/stage0/fixtures/price-label.json','utf8'));
 fixture.id='saved';fixture.template_json.label.gapX=0;fixture.template_json.label.rows=2;fixture.template_json.label.columns=2;
 fixture.template_json.elements=fixture.template_json.elements.filter(e=>e.type!=='image');
 const noPrice=structuredClone(fixture);noPrice.id='no-price';noPrice.nombre='Sin precio';noPrice.template_json.elements=noPrice.template_json.elements.filter(e=>e.type!=='price');
 const clipped=structuredClone(fixture);clipped.id='clipped';clipped.nombre='Texto largo';
 const text=clipped.template_json.elements.find(e=>e.type==='text');text.binding=undefined;text.content=Array(60).fill('Línea larga').join('\n');
 const imageTemplate=structuredClone(fixture);imageTemplate.id='image';imageTemplate.nombre='Imagen remota';
 imageTemplate.template_json.elements.push({id:'image',name:'Imagen del artículo',type:'image',position:{x:1,y:1},size:{width:5,height:5},style:{},zIndex:10,locked:false,sourceType:'url',url:'http://review.test/label-image.svg',fit:'contain'});
 const brokenImage=structuredClone(imageTemplate);brokenImage.id='broken-image';brokenImage.nombre='Imagen fallida';brokenImage.template_json.elements.find(e=>e.type==='image').url+='?broken';
 let fail=false,expired=false,disabled=false,delay=0;let resolves=0;
 const article=i=>({id:'a'+i,code:'CODE'+i,name:'Artículo '+i,barcode:'77900000000'+i,image:null});
 const row=(i,list)=>({articleId:'a'+i,status:'available',article:article(i),price:{status:list==='b'&&i===3?'missing':'available',amount:list==='b'&&i===3?null:i===2?'0.00':list==='a'?'100.25':'80.50',currencyCode:'UYU',currencySymbol:'$',taxTreatment:'unknown'}});
 await page.route('**/*',async route=>{
 const url=new URL(route.request().url()),p=url.pathname;
 if(url.hostname!=='review.test')return route.abort();
 if(p==='/api/auth/session')return route.fulfill(expired?{status:401,json:{}}:{json:{user:{id:'demo'},company_id:'company',role:'viewer',csrf_token:'demo',companies:[]}});
 if(p==='/api/templates')return route.fulfill({json:[fixture,noPrice,clipped,imageTemplate,brokenImage]});
 if(p==='/label-image.svg'){await new Promise(r=>setTimeout(r,300));return route.fulfill(url.searchParams.has('broken')?{status:404,body:''}:{contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'});}
 if(p==='/api/label-print/context')return route.fulfill({json:{mode:disabled?'disabled':'demo',available:!disabled,company:{name:'Demo',logo:null}}});
 if(p==='/api/label-print/price-lists')return route.fulfill({json:{items:[{id:'a',name:'General'},{id:'b',name:'Mayorista'}],nextCursor:null}});
 if(p==='/api/label-print/articles')return route.fulfill({json:{items:url.searchParams.get('query')==='none'?[]:(url.searchParams.has('cursor')?[3]:[1,2]).map(i=>row(i,url.searchParams.get('priceListId'))),nextCursor:url.searchParams.has('cursor')?null:'next'}});
 if(p==='/api/label-print/resolve'){
 resolves++;const body=route.request().postDataJSON();if(delay)await new Promise(r=>setTimeout(r,delay));
 return route.fulfill(fail?{status:503,json:{}}:{json:{mode:'demo',priceListId:body.priceListId,resolvedAt:'2026-11-17T12:00:00Z',sourceRevision:'1',company:{name:'Demo',logo:null},items:body.articleIds.map(id=>row(Number(id.slice(1)),body.priceListId))}}).catch(()=>{});
 }
 if(p.startsWith('/api/'))return route.fulfill({status:404});
 const name=p.split('/').pop(),asset=/^[\w.-]+\.(js|css|ico)$/.test(name)?name:'index.html';
 return route.fulfill({body:fs.readFileSync('dist/zureo-report-designer/browser/'+asset),contentType:asset.endsWith('.js')?'application/javascript':asset.endsWith('.css')?'text/css':'text/html'});
 });
 await page.goto('http://review.test/price-labels/print');
 await page.getByLabel('Molde guardado').selectOption('saved');await page.getByLabel('Lista de precios').selectOption('a');
 await page.getByLabel('Buscar por código o código de barras').fill('CODE');await page.getByRole('button',{name:'Buscar',exact:true}).click();
 for(const i of [1,2])await page.getByRole('button',{name:'Agregar CODE'+i,exact:true}).click();
 await page.getByRole('button',{name:'Más resultados',exact:true}).click();await page.getByRole('button',{name:'Agregar CODE3',exact:true}).click();
 for(const i of [1,2,3]){const input=page.getByLabel('Cantidad de Artículo '+i,{exact:true});await input.fill(String([2,5,1][i-1]));await input.press('Tab');}
 await expect(page.frameLocator('iframe').locator('.label-cell')).toHaveCount(8);
 await expect(page.frameLocator('iframe').locator('.page')).toHaveCount(2);
 await expect(page.getByRole('button',{name:'Agregado CODE3',exact:true})).toBeDisabled();
 // Final partial page, page navigation and full-document printing/export.
 const third=page.getByLabel('Cantidad de Artículo 3',{exact:true});await third.fill('2');await third.press('Tab');
 await expect(page.frameLocator('iframe').locator('.page')).toHaveCount(3);
 await page.getByRole('button',{name:'Página siguiente',exact:true}).click();
 await expect(page.getByRole('navigation',{name:'Páginas del lote'})).toContainText('Página 2 de 3');
 await page.getByRole('button',{name:'Página siguiente',exact:true}).click();
 await expect(page.frameLocator('iframe').locator('.page').last().locator('.label-cell')).toHaveCount(1);
 await page.evaluate(()=>{const frame=document.querySelector('iframe');window.checkedDocument=frame.contentDocument;window.printed=0;frame.contentWindow.print=()=>{if(frame.contentDocument!==window.checkedDocument)throw Error('Document replaced');window.printed=frame.contentDocument.querySelectorAll('.label-cell').length;};});
 await page.getByRole('button',{name:'Imprimir',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.printed)).toBe(9);
 const htmlDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar HTML',exact:true}).click();
 const exported=fs.readFileSync(await (await htmlDownload).path(),'utf8');assert.equal((exported.match(/class="label-cell"/g)||[]).length,9);assert.ok(!exported.includes('Diagnóstico por artículo'));
 const pdfPage=await browser.newPage();await pdfPage.setContent(exported);const pdf=await pdfPage.pdf({preferCSSPageSize:true});assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,3);await pdfPage.close();
 await page.getByLabel('Molde guardado').selectOption('clipped');
 const diagnostic=page.getByRole('region',{name:'Diagnóstico del lote'});
 await expect(diagnostic.getByRole('status').filter({hasText:'Texto recortado'})).toHaveCount(3);
 await expect(diagnostic.getByRole('status').filter({hasText:'CODE2'})).toContainText('5 etiquetas');
 await expect(page.getByRole('button',{name:'Imprimir',exact:true})).toBeEnabled();
 await page.getByLabel('Molde guardado').selectOption('image');
 await expect(page.getByRole('button',{name:'Imprimir',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Imprimir',exact:true})).toBeEnabled();
 await page.getByLabel('Molde guardado').selectOption('broken-image');
 await expect(diagnostic.getByRole('alert')).toHaveCount(3);
 await expect(diagnostic.getByRole('alert').first()).toContainText('Imagen del artículo');
 await expect(page.getByRole('button',{name:'Imprimir',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Exportar HTML',exact:true})).toBeDisabled();
 await page.getByLabel('Molde guardado').selectOption('saved');
 await third.fill('1');await third.press('Tab');

 await page.getByLabel('Lista de precios').selectOption('b');
 await expect(page.getByRole('button',{name:'Imprimir',exact:true})).toBeDisabled();
 await expect(page.getByRole('heading',{name:'Lote · 8 / 100 etiquetas'})).toBeVisible();
 await expect(page.getByRole('alert').first()).toContainText('precio ausente');
 await page.getByLabel('Molde guardado').selectOption('no-price');await expect(page.getByRole('button',{name:'Imprimir',exact:true})).toBeEnabled();
 await page.getByLabel('Lista de precios').selectOption('a');await page.getByLabel('Molde guardado').selectOption('saved');
 await expect(page.frameLocator('iframe').locator('.label-price').first()).toContainText('100,25');
 fail=true;await page.getByRole('button',{name:'Actualizar precios',exact:true}).click();
 await expect(page.getByRole('alert').first()).toContainText('No se pudieron actualizar');
 await expect(page.getByRole('button',{name:'Exportar HTML',exact:true})).toBeEnabled();
 const before=resolves;const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar HTML',exact:true}).click();await download;
 if(resolves!==before)throw Error('Export refreshed prices');
 fail=false;delay=200;await page.getByLabel('Lista de precios').selectOption('b');await page.getByLabel('Lista de precios').selectOption('a');
 await expect(page.frameLocator('iframe').locator('.label-price').first()).toContainText('100,25');delay=0;
 const input=page.getByLabel('Cantidad de Artículo 1',{exact:true});await input.fill('100');await input.press('Tab');await expect(input).toHaveValue('2');
 expired=true;await page.getByRole('button',{name:'Exportar HTML',exact:true}).click();await expect(page.locator('iframe')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Lote · 0 / 100 etiquetas'})).toBeVisible();
 expired=false;disabled=true;await page.reload();await expect(page.getByText('El proveedor de artículos no está habilitado.',{exact:false})).toBeVisible();await expect(page.getByLabel('Lista de precios')).toHaveCount(0);
 console.log('PASS: API catalog, pagination, deduplication, quantities, list changes, missing/zero prices, manual refresh failure, snapshot export, late responses, expired session and disabled provider.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
