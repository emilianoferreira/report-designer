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
 const historical = structuredClone(fixture);
 historical.id = 'historical';
 Object.assign(historical.template_json.page, { mode: 'continuous', size: 'custom', width: 115, height: 75 });
 const thermal = structuredClone(clipped);
 thermal.id = 'thermal';
 thermal.template_json.printProfiles = { schemaVersion: 1, thermal: {
   width: 55, height: 33, printableWidth: 54, offsetX: 2, offsetY: 1, media: 'gap'
 } };
 const tooNarrow = structuredClone(thermal);
 tooNarrow.id = 'too-narrow';
 tooNarrow.template_json.printProfiles.thermal.printableWidth = 49;
 let fail=false,expired=false,disabled=false,delay=0;let resolves=0;
 let editor = false;
 let failTemplateFetch = true;
 const createdMolds = new Map();
 const logo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="black"/></svg>');
 const article=i=>({id:'a'+i,code:'CODE'+i,name:'Artículo '+i,barcode:'77900000000'+i,image:null});
 const row=(i,list)=>({articleId:'a'+i,status:'available',article:article(i),price:{status:list==='b'&&i===3?'missing':'available',amount:list==='b'&&i===3?null:i===2?'0.00':list==='a'?'100.25':'80.50',currencyCode:'UYU',currencySymbol:'$',taxTreatment:'unknown'}});
 await page.route('**/*',async route=>{
 const url=new URL(route.request().url()),p=url.pathname;
 if(url.hostname!=='review.test')return route.abort();
 if(p==='/api/auth/session')return route.fulfill(expired?{status:401,json:{}}:{json:{user:{id:'demo'},company_id:'company',role:editor?'editor':'viewer',csrf_token:'demo',companies:[]}});
 if(p==='/api/templates' && route.request().method() === 'POST') {
   assert.equal(route.request().headers()['x-csrf-token'], 'demo');
   assert.ok(editor);
   const body = route.request().postDataJSON();
   const saved = { ...body, id: 'created-' + (createdMolds.size + 1), version: 1, updated_at: '2026-11-17T12:00:00Z' };
   createdMolds.set(saved.id, saved);
   return route.fulfill({status:201,json:saved});
 }
 if(p==='/api/templates')return route.fulfill({json:[fixture,noPrice,clipped,imageTemplate,brokenImage,historical,thermal,tooNarrow,...createdMolds.values()]});
 if(p==='/api/templates/saved')return route.fulfill(failTemplateFetch
   ? {status:503,json:{}}
   : {json:{...fixture,nombre:'Revisión guardada más reciente',version:2}});
 const moldId = p.split('/')[3];
 if(p.startsWith('/api/templates/') && createdMolds.has(moldId)) {
   const mold = createdMolds.get(moldId);
   const method = route.request().method();
   if(method === 'GET') return route.fulfill({json:mold});
   assert.ok(editor);
   assert.equal(route.request().headers()['x-csrf-token'], 'demo');
   if(method === 'POST' && p.endsWith('/duplicate')) {
     const copy = { ...structuredClone(mold), id: 'created-copy', nombre: mold.nombre + ' (copia)', version: 1 };
     createdMolds.set(copy.id, copy);
     return route.fulfill({status:201,json:copy});
   }
   if (method === 'PUT' && p.endsWith('/design')) {
     if (route.request().headers()['if-match'] !== JSON.stringify(String(mold.version))) {
       return route.fulfill({status:409,json:{}});
     }
     const updated = { ...mold, ...route.request().postDataJSON(), version: mold.version + 1 };
     createdMolds.set(moldId, updated);
     return route.fulfill({json:updated});
   }
   if(method === 'DELETE') {
     if (route.request().headers()['if-match'] !== JSON.stringify(String(mold.version))) return route.fulfill({status:409,json:{}});
     createdMolds.delete(moldId);
     return route.fulfill({status:200,body:''});
   }
 }
 if(p==='/label-image.svg'){await new Promise(r=>setTimeout(r,300));return route.fulfill(url.searchParams.has('broken')?{status:404,body:''}:{contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'});}
 if(p==='/api/label-print/context')return route.fulfill({json:{mode:disabled?'disabled':'demo',available:!disabled,company:{name:'Demo',logo}}});
 if(p==='/api/label-print/price-lists')return route.fulfill({json:{items:[{id:'a',name:'General'},{id:'b',name:'Mayorista'}],nextCursor:null}});
 if(p==='/api/label-print/articles'){
   const query = url.searchParams.get('query');
   const cursor = url.searchParams.get('cursor');
   if (cursor && cursor !== query) return route.fulfill({status:400,json:{}});
   return route.fulfill({json:{items:query==='none'?[]:(cursor?[3]:[1,2]).map(i=>row(i,url.searchParams.get('priceListId'))),nextCursor:cursor || query==='none'?null:query}});
 }
 if(p==='/api/label-print/resolve'){
 resolves++;const body=route.request().postDataJSON();if(delay)await new Promise(r=>setTimeout(r,delay));
 return route.fulfill(fail?{status:503,json:{}}:{json:{mode:'demo',priceListId:body.priceListId,resolvedAt:'2026-11-17T12:00:00Z',sourceRevision:'1',company:{name:'Demo',logo},items:body.articleIds.map(id=>row(Number(id.slice(1)),body.priceListId))}}).catch(()=>{});
 }
 if(p.startsWith('/api/'))return route.fulfill({status:404});
 const name=p.split('/').pop(),asset=/^[\w.-]+\.(js|css|ico)$/.test(name)?name:'index.html';
 return route.fulfill({body:fs.readFileSync('dist/zureo-report-designer/browser/'+asset),contentType:asset.endsWith('.js')?'application/javascript':asset.endsWith('.css')?'text/css':'text/html'});
 });
 await page.goto('http://review.test/price-labels/print?templateId=saved');
 await expect(page.getByRole('alert')).toHaveText('No se pudo cargar la revisión del molde.');
 await expect(page.getByLabel('Molde guardado')).toHaveValue('');
 failTemplateFetch = false;
 await page.getByRole('button', { name: 'Reintentar molde', exact: true }).click();
 await expect(page.getByLabel('Molde guardado').locator('option:checked')).toHaveText('Revisión guardada más reciente');
 await page.getByLabel('Lista de precios').selectOption('a');
 await page.getByLabel('Buscar por nombre, código o código de barras').fill('CODE');await page.getByRole('button',{name:'Buscar',exact:true}).click();
 for(const i of [1,2])await page.getByRole('button',{name:'Agregar CODE'+i,exact:true}).click();
 const search = page.getByLabel('Buscar por nombre, código o código de barras');
 await search.fill('otra búsqueda aún sin confirmar');
 await page.getByRole('button',{name:'Más resultados',exact:true}).click();await page.getByRole('button',{name:'Agregar CODE3',exact:true}).click();
 await search.fill('CODE');
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
 await expect(page.locator('#label-output-summary')).toContainText('General');
 await expect(page.locator('#label-output-summary')).toContainText('Última consulta válida 17/11/2026');
 await expect(page.getByRole('button',{name:'Exportar HTML',exact:true})).toBeEnabled();
 const before=resolves;const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar HTML',exact:true}).click();await download;
 if(resolves!==before)throw Error('Export refreshed prices');
 fail=false;delay=200;await page.getByLabel('Lista de precios').selectOption('b');await page.getByLabel('Lista de precios').selectOption('a');
 await expect(page.frameLocator('iframe').locator('.label-price').first()).toContainText('100,25');delay=0;
 const input=page.getByLabel('Cantidad de Artículo 1',{exact:true});await input.fill('100');await input.press('Tab');await expect(input).toHaveValue('2');

 const frame = page.frameLocator('iframe');
 await page.getByLabel('Molde guardado').selectOption('historical');
 await expect(frame.locator('.page')).toHaveCount(2);
 await expect(frame.locator('.page').first().locator('.label-cell')).toHaveCount(4);
 assert.ok((await frame.locator('style').textContent()).includes('size: 115mm 75mm'));
 await page.getByLabel('Molde guardado').selectOption('thermal');
 await expect(frame.locator('.page')).toHaveCount(2);
 await page.getByLabel('Perfil de impresión').selectOption('thermal');
 await expect(frame.locator('.page')).toHaveCount(8);
 assert.ok((await frame.locator('style').textContent()).includes('padding: 1mm 0mm 0mm 2mm'));
 await expect(diagnostic.getByRole('status').filter({ hasText: 'CODE2' })).toContainText('Página 7');
 await expect(diagnostic.getByRole('status').filter({ hasText: 'CODE2' })).not.toContainText('Página 8');
 const previewLabels = await frame.locator('.label-cell').allTextContents();
 await page.evaluate(() => {
   const iframe = document.querySelector('iframe');
   const shown = iframe.contentDocument;
   iframe.contentWindow.print = () => {
     if (iframe.contentDocument !== shown) throw Error('Document replaced');
     window.printed = [...shown.querySelectorAll('.label-cell')].map(cell => cell.textContent);
   };
 });
 await page.getByRole('button', { name: 'Imprimir', exact: true }).click();
 await expect.poll(() => page.evaluate(() => window.printed)).toEqual(previewLabels);
 const rollDownload = page.waitForEvent('download');
 await page.getByRole('button', { name: 'Exportar HTML', exact: true }).click();
 const rollHtml = fs.readFileSync(await (await rollDownload).path(), 'utf8');
 const rollPdfPage = await browser.newPage();
 await rollPdfPage.setContent(rollHtml);
 assert.deepEqual(await rollPdfPage.locator('.label-cell').allTextContents(), previewLabels);
 const rollPdf = (await rollPdfPage.pdf({ preferCSSPageSize: true })).toString('latin1');
 assert.equal((rollPdf.match(/\/Type \/Page\b/g) || []).length, 8);
 const [, width, height] = rollPdf.match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/);
 assert.ok(Math.abs(Number(width) * 25.4 / 72 - 55) < 0.5);
 assert.ok(Math.abs(Number(height) * 25.4 / 72 - 33) < 0.5);
 await rollPdfPage.close();
 await page.getByLabel('Perfil de impresión').selectOption('sheet');
 await expect(frame.locator('.page')).toHaveCount(2);
 await page.getByLabel('Molde guardado').selectOption('too-narrow');
 await page.getByLabel('Perfil de impresión').selectOption('thermal');
 await expect(diagnostic.getByRole('alert')).toContainText('superan el área imprimible');
 await expect(page.getByRole('button', { name: 'Imprimir', exact: true })).toBeDisabled();
 await page.getByLabel('Molde guardado').selectOption('saved');
 console.log('PASS: historical custom sheet, thermal pagination, diagnostics, same print document, PDF dimensions and incompatible roll.');

 const removal = page.getByRole('button', { name: /^Eliminar Artículo .* del lote$/ });
 for (let count = await removal.count(); count > 0; count--) {
   await removal.first().click();
   await expect(removal).toHaveCount(count - 1);
 }
 await expect(page.getByText('Última consulta:', { exact: false })).toHaveCount(0);
 await expect(page.locator('iframe')).toHaveCount(0);
 await page.getByRole('button', { name: 'Agregar CODE1', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Exportar HTML', exact: true })).toBeEnabled();

 expired=true;await page.getByRole('button',{name:'Exportar HTML',exact:true}).click();await expect(page.locator('iframe')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Lote · 0 / 100 etiquetas'})).toBeVisible();
 expired=false;disabled=true;await page.reload();await expect(page.getByText('El proveedor de artículos no está habilitado.',{exact:false})).toBeVisible();await expect(page.getByLabel('Lista de precios')).toHaveCount(0);
 console.log('PASS: API catalog, pagination, deduplication, quantities, list changes, missing/zero prices, manual refresh failure, snapshot export, late responses, expired session and disabled provider.');

 editor = true;
 disabled = false;
 await page.setViewportSize({ width: 1280, height: 720 });
 await page.goto('http://review.test/templates/labels');
 await page.getByRole('link', { name: '+ Nuevo molde', exact: true }).click();
 const moldName = 'Tirada completa A4 y térmica';
 await page.getByLabel('Nombre del molde').fill(moldName);
 await page.getByRole('combobox', { name: /^Tamaño de la etiqueta/ }).selectOption('custom');
 await page.getByLabel('Ancho (mm)', { exact: true }).fill('55');
 await page.getByLabel('Alto (mm)', { exact: true }).fill('33');
 await page.getByRole('radio', { name: 'Rollo térmico', exact: true }).check();
 await page.getByRole('button', { name: 'Continuar al editor', exact: true }).click();
 const nameInput = page.getByLabel('Nombre de la plantilla', { exact: true });
 await expect(nameInput).toHaveValue(moldName);
 await page.getByRole('button', { name: 'Configuración de impresión', exact: true }).click();
 for (const field of ['Columnas', 'Filas']) {
   const input = page.getByLabel(field, { exact: true });
   await input.fill('2');
   await input.press('Tab');
 }
 await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
 await expect(page.getByText('Demostración — artículos de ejemplo.', { exact: true })).toBeVisible();
 await expect(frame.locator('.label-cell')).toHaveCount(4);
 await expect(frame.locator('.page')).toHaveCount(4);
 await page.getByRole('button', { name: 'Guardar', exact: true }).click();
 await expect(page).toHaveURL(/\/price-labels\/created-1\/edit$/);
 let saved = createdMolds.get('created-1').template_json;
 assert.equal(saved.printProfiles.thermal.width, 55);
 assert.equal(saved.printProfiles.thermal.height, 33);
 assert.equal(saved.printProfiles.defaultProfile, 'thermal');
 assert.equal(saved.label.columns, 2);
 assert.equal(saved.label.rows, 2);
 assert.deepEqual(saved.elements.map(element => element.type).sort(), ['barcode', 'image', 'price', 'text']);
 assert.equal(saved.articles, undefined);
 await page.getByRole('button', { name: 'Volver a documentos', exact: true }).click();
 const card = page.getByRole('article').filter({ hasText: moldName });
 await card.getByRole('link', { name: 'Editar', exact: true }).click();
 await expect(nameInput).toHaveValue(moldName);
 await page.getByRole('button', { name: 'Preparar impresión', exact: true }).click();
 await expect(page).toHaveURL(/\/price-labels\/print\?templateId=created-1$/);
 await expect(page.getByLabel('Molde guardado')).toHaveValue('created-1');
 await expect(page.getByLabel('Perfil de impresión')).toHaveValue('thermal');
 await page.getByLabel('Lista de precios').selectOption('a');
 await search.fill('Artículo');
 await search.press('Enter');
 for (const [id, count] of [[1, 2], [2, 3]]) {
   await page.getByRole('button', { name: 'Agregar CODE' + id, exact: true }).click();
   const quantity = page.getByLabel('Cantidad de Artículo ' + id, { exact: true });
   await quantity.fill(String(count));
   await quantity.press('Tab');
 }
 await expect(frame.locator('.page')).toHaveCount(5);
 await expect(frame.locator('.label-price').first()).toContainText('100,25');
 await page.getByLabel('Perfil de impresión').selectOption('thermal');
 await expect(frame.locator('.page')).toHaveCount(5);
 const secondQuantity = page.getByLabel('Cantidad de Artículo 2', { exact: true });
 await secondQuantity.fill('1');
 await secondQuantity.press('Tab');
 const summary = page.locator('#label-output-summary');
 await expect(summary).toContainText('General · 2 artículos');
 await expect(summary).toContainText('3 etiquetas · Rollo térmico 55 × 33 mm · 3 páginas');
 delay = 450;
 await page.getByLabel('Lista de precios').selectOption('b');
 await expect(page.getByText('Actualizando los precios para imprimir…')).toBeVisible();
 await expect(summary).toHaveCount(0);
 await expect(page.getByRole('button', { name: 'Imprimir', exact: true })).toHaveCount(0);
 await expect(summary).toContainText('Mayorista · 2 artículos');
 await expect(summary).toContainText('Precios consultados 17/11/2026');
 await expect(summary).toContainText('3 etiquetas · Rollo térmico 55 × 33 mm · 3 páginas');
 delay = 0;
 await expect(page.getByLabel('Perfil de impresión')).toHaveValue('thermal');
 await expect(secondQuantity).toHaveValue('1');
 await expect(frame.locator('.label-price').first()).toContainText('80,50');
 await expect(frame.locator('.label-price').last()).toContainText('0,00');
 await page.getByLabel('Perfil de impresión').selectOption('sheet');
 await expect(summary).toContainText('3 etiquetas · Hoja A4 210 × 297 mm · 1 página');
 await secondQuantity.fill('3');
 await secondQuantity.press('Tab');
 await page.getByRole('button', { name: 'Abrir molde', exact: true }).click();
 await expect(page).toHaveURL(/\/price-labels\/created-1\/edit\?batch=\d+$/);
 const elementPicker = page.getByRole('combobox', { name: /^Elemento del molde/ });
 const priceIndex = await elementPicker.locator('option').evaluateAll(options =>
   options.findIndex(option => option.textContent.trim() === 'Precio'));
 assert.ok(priceIndex > 0);
 await tabTo(elementPicker);
 await page.keyboard.press('Home');
 for (let index = 0; index < priceIndex; index++) await page.keyboard.press('ArrowDown');
 await page.locator('app-price-label-properties').getByRole('button', { name: 'Datos', exact: true }).click();
 await page.getByLabel('Prefijo', { exact: true }).fill('@');
 await page.getByLabel('Prefijo', { exact: true }).press('Tab');
 const beforeResume = resolves;
 await page.getByRole('button', { name: 'Guardar y volver al lote', exact: true }).click();
 await expect(page.getByText('Lote recuperado.', { exact: false })).toBeVisible();
 await expect(page.getByLabel('Molde guardado')).toHaveValue('created-1');
 await expect(page.getByLabel('Perfil de impresión')).toHaveValue('sheet');
 await expect(page.getByLabel('Lista de precios')).toHaveValue('b');
 await expect(page.getByLabel('Cantidad de Artículo 1', { exact: true })).toHaveValue('2');
 await expect(page.getByLabel('Cantidad de Artículo 2', { exact: true })).toHaveValue('3');
 await expect(frame.locator('.label-price').first()).toContainText('@$ 80,50');
 assert.ok(resolves > beforeResume);
 saved = createdMolds.get('created-1').template_json;
 assert.equal(saved.elements.find(element => element.type === 'price').prefix, '@');

 await page.getByRole('button', { name: 'Abrir molde', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Volver al lote', exact: true })).toBeVisible();
 await page.goBack();
 await expect(page.getByLabel('Cantidad de Artículo 2', { exact: true })).toHaveValue('3');
 await expect(frame.locator('.label-price').first()).toContainText('@$ 80,50');

 const expectedItems = ['Artículo 1', 'Artículo 1', 'Artículo 2', 'Artículo 2', 'Artículo 2'];
 for (const [profile, pages, pageSize] of [['thermal', 5, '55mm 33mm'], ['sheet', 2, '210mm 297mm']]) {
   await page.getByLabel('Perfil de impresión').selectOption(profile);
   await expect(frame.locator('.page')).toHaveCount(pages);
   const exported = page.waitForEvent('download');
   await page.getByRole('button', { name: 'Exportar HTML', exact: true }).click();
   const markup = fs.readFileSync(await (await exported).path(), 'utf8');
   assert.ok(markup.includes('size: ' + pageSize));
   const output = await browser.newPage();
   try {
     await output.setContent(markup);
     assert.deepEqual(await output.locator('.label-text').allTextContents(), expectedItems);
     await expect(output.locator('.label-barcode svg')).toHaveCount(5);
     await expect(output.locator('.label-image img')).toHaveCount(5);
     await expect(output.locator('.label-price').first()).toContainText('@$ 80,50');
     await expect(output.locator('.label-price').last()).toContainText('0,00');
     const physicalPages = (await output.pdf({ preferCSSPageSize: true })).toString('latin1');
     assert.equal((physicalPages.match(/\/Type \/Page\b/g) || []).length, pages);
     const expectedSize = pageSize.split(' ').map(value => Number.parseFloat(value));
     const boxes = [...physicalPages.matchAll(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/g)];
     assert.equal(boxes.length, pages);
     for (const box of boxes) {
       box.slice(1).forEach((points, index) => assert.ok(Math.abs(Number(points) * 25.4 / 72 - expectedSize[index]) < 0.65));
     }
   } finally { await output.close(); }
 }
 console.log('PASS: resume batch after editing or browser Back, resolve the same price list, and verify the updated mold in A4 and thermal HTML/PDF.');
 page.once('dialog', dialog => dialog.accept());
 await page.getByRole('link', { name: '← Moldes de etiquetas', exact: true }).click();
 const original = page.getByRole('article').filter({ has: page.getByRole('heading', { name: moldName, exact: true }) });
 await expect(original).toContainText('Hoja A4 · Rollo térmico');
 await original.getByRole('button', { name: 'Duplicar etiqueta', exact: true }).click();
 await expect(page).toHaveURL(/\/price-labels\/created-copy\/edit$/);
 await expect(page.getByLabel('Nombre de la plantilla')).toHaveValue(moldName + ' (copia)');
 await page.getByRole('button', { name: 'Volver a documentos', exact: true }).click();
 const copy = page.getByRole('article').filter({ has: page.getByRole('heading', { name: moldName + ' (copia)', exact: true }) });
 await expect(copy).toBeVisible();
 assert.deepEqual(createdMolds.get('created-copy').template_json, saved);
 await copy.getByRole('button', { name: 'Eliminar etiqueta', exact: true }).click();
 const confirmation = page.getByRole('dialog', { name: 'Eliminar molde' });
 const cancel = confirmation.getByRole('button', { name: 'Cancelar', exact: true });
 const confirm = confirmation.getByRole('button', { name: 'Eliminar', exact: true });
 await expect(cancel).toBeFocused();
 await page.keyboard.press('Shift+Tab');
 await expect(confirm).toBeFocused();
 createdMolds.get('created-copy').version++;
 await confirm.click();
 await expect(page.getByRole('alert')).toContainText('El molde cambió en el servidor');
 await expect(copy).toBeVisible();
 await copy.getByRole('button', { name: 'Eliminar etiqueta', exact: true }).click();
 await confirm.click();
 await expect(copy).toHaveCount(0);
 await expect(original).toBeVisible();
 console.log('PASS: library profile metadata, duplicate label and revision-checked deletion with keyboard confirmation.');

 await page.getByRole('link', { name: '+ Nuevo molde', exact: true }).click();
 await page.getByLabel('Nombre del molde').fill('Plancha desde el alta guiada');
 await page.getByRole('combobox', { name: /^Tamaño de la etiqueta/ }).selectOption('40x25');
 await page.getByRole('radio', { name: 'Hoja A4', exact: true }).check();
 await page.getByRole('button', { name: 'Continuar al editor', exact: true }).click();
 await page.getByRole('button', { name: 'Guardar y preparar impresión', exact: true }).click();
 await expect(page).toHaveURL(/\/price-labels\/print\?templateId=created-2$/);
 await expect(page.getByLabel('Molde guardado')).toHaveValue('created-2');
 await expect(page.getByLabel('Perfil de impresión')).toHaveCount(0);
 assert.equal(createdMolds.get('created-2').template_json.label.width, 40);
 assert.equal(createdMolds.get('created-2').template_json.label.height, 25);
 await page.getByLabel('Lista de precios').selectOption('a');
 await search.fill('Artículo');
 await search.press('Enter');
 await page.getByRole('button', { name: 'Agregar CODE1', exact: true }).click();
 const a4Export = page.waitForEvent('download');
 await page.getByRole('button', { name: 'Exportar HTML', exact: true }).click();
 const a4Markup = fs.readFileSync(await (await a4Export).path(), 'utf8');
 assert.ok(a4Markup.includes('size: 210mm 297mm'));
 assert.ok(a4Markup.includes('repeat(4, 40mm)'));
 assert.ok(a4Markup.includes('Artículo 1'));
 console.log('PASS: A4 preset guided setup, save-and-prepare and batch export.');

 async function tabTo(control, direction = 'Tab') {
   await expect(control).toBeVisible();
   for (let steps = 0; steps < 48; steps++) {
     if (await control.evaluate(node => node === document.activeElement)) {
       await expect(control).toBeInViewport({ ratio: 0.75 });
       return;
     }
     await page.keyboard.press(direction);
   }
   await expect(control).toBeFocused();
 }
 for (const [width, height, useThermal] of [[1280, 720, true], [1600, 900, false]]) {
   await page.setViewportSize({ width, height });
   page.once('dialog', dialog => dialog.accept());
   await page.goto('http://review.test/templates/labels');
   await tabTo(page.getByRole('link', { name: '+ Nuevo molde', exact: true }));
   await page.keyboard.press('Enter');
   const guidedName = page.getByLabel('Nombre del molde', { exact: true });
   await expect(guidedName).toBeFocused();
   await page.keyboard.press('Enter');
   await expect(page.getByRole('alert')).toHaveText('Ingresá un nombre para el molde.');
   await expect(guidedName).toBeFocused();
   await page.keyboard.type('Recorrido por teclado ' + width);
   const size = page.getByRole('combobox', { name: /^Tamaño de la etiqueta/ });
   await tabTo(size);
   await page.keyboard.press('ArrowDown');
   await expect(size).toHaveValue('60x40');
   const a4 = page.getByRole('radio', { name: 'Hoja A4', exact: true });
   await tabTo(a4);
   if (useThermal) {
     await page.keyboard.press('ArrowRight');
     await expect(page.getByRole('radio', { name: 'Rollo térmico', exact: true })).toBeChecked();
   }
   await tabTo(page.getByRole('button', { name: 'Continuar al editor', exact: true }));
   await page.keyboard.press('Enter');
   await expect(page.locator('.label-surface')).toBeFocused();
   if (!useThermal) {
     await page.keyboard.press('Control+s');
     await expect(page).toHaveURL(/\/price-labels\/created-\d+\/edit$/);
     await expect(page.locator('.label-surface')).toBeFocused();
   }
   const prepare = page.getByRole('button', { name: useThermal ? 'Guardar y preparar impresión' : 'Preparar impresión', exact: true });
   await tabTo(prepare, 'Shift+Tab');
   await page.keyboard.press('Enter');
   await expect(page.getByRole('heading', { name: 'Preparar impresión', exact: true })).toBeFocused();
   if (useThermal) {
     const profile = page.getByRole('combobox', { name: /^Perfil de impresión/ });
     await tabTo(profile);
     await page.keyboard.press('ArrowUp');
     await expect(profile).toHaveValue('sheet');
     await page.keyboard.press('ArrowDown');
     await expect(profile).toHaveValue('thermal');
   }
   const priceList = page.getByRole('combobox', { name: /^Lista de precios/ });
   await tabTo(priceList);
   await page.keyboard.press('ArrowDown');
   await expect(priceList).toHaveValue('a');
   await tabTo(search);
   await page.keyboard.type('Articulo');
   await page.keyboard.press('Enter');
   const add = page.getByRole('button', { name: 'Agregar CODE1', exact: true });
   await tabTo(add);
   await page.keyboard.press('Enter');
   await expect(page.getByRole('button', { name: 'Agregado CODE1', exact: true })).toBeFocused();
   await tabTo(page.getByRole('button', { name: 'Ir al lote', exact: true }), 'Shift+Tab');
   await page.keyboard.press('Enter');
   const batchTitle = page.getByRole('heading', { name: /^Lote · 1/ });
   await expect(batchTitle).toBeFocused();
   const quantity = page.getByLabel('Cantidad de Artículo 1', { exact: true });
   await tabTo(quantity);
   await page.keyboard.press('ArrowUp');
   await tabTo(page.getByRole('button', { name: 'Ir a revisión', exact: true }));
   await page.keyboard.press('Enter');
   await expect(page.getByRole('heading', { name: 'Revisar e imprimir', exact: true })).toBeFocused();
   await expect(page.locator('.preview-body')).toBeInViewport({ ratio: 0.75 });
   await expect(frame.locator('.label-cell')).toHaveCount(2);
   const exportButton = page.getByRole('button', { name: 'Exportar HTML', exact: true });
   await tabTo(exportButton);
   const downloaded = page.waitForEvent('download');
   await page.keyboard.press('Enter');
   const html = fs.readFileSync(await (await downloaded).path(), 'utf8');
   assert.ok(html.includes(useThermal ? 'size: 60mm 40mm' : 'size: 210mm 297mm'));
   assert.equal((html.match(/class="label-cell"/g) || []).length, 2);
   await expect(exportButton).toBeFocused();
   await expect(page.getByRole('status').filter({ hasText: 'Descarga HTML iniciada.' })).toBeVisible();
   const title = page.getByRole('heading', { name: 'Preparar impresión', exact: true });
   assert.ok(await title.evaluate(heading => {
     const host = heading.closest('header').parentElement;
     return host.scrollWidth <= host.clientWidth + 1;
   }));
   if (process.env.LABEL_KEYBOARD_SCREENSHOTS) await page.screenshot({ path: `tmp/labels-keyboard-${width}.png` });
   const remove = page.getByRole('button', { name: 'Eliminar Artículo 1 del lote', exact: true });
   await tabTo(remove, 'Shift+Tab');
   await page.keyboard.press('Enter');
   await expect(search).toBeFocused();
   console.log('PASS: guided setup to export by keyboard at ' + width + '×' + height + '.');
 }
 page.once('dialog', dialog => dialog.accept());
 await page.goto('http://review.test/price-labels/print?templateId=created-1');
 await page.getByLabel('Lista de precios').selectOption('b');
 await search.fill('CODE'); await search.press('Enter');
 for (const code of ['CODE1', 'CODE2']) await page.getByRole('button', { name: 'Agregar ' + code, exact: true }).click();
 const copies = page.getByLabel('Cantidad de Artículo 1', { exact: true });
 await copies.fill('2'); await copies.press('Tab');
 await expect(frame.locator('.label-cell')).toHaveCount(3);
 await page.getByRole('button', { name: 'Abrir molde', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Volver al lote', exact: true })).toBeVisible();
 createdMolds.get('created-1').version++;
 await page.locator('.price-content').click();
 await page.locator('app-price-label-properties').getByRole('button', { name: 'Datos', exact: true }).click();
 await page.getByLabel('Prefijo', { exact: true }).fill('COPIA ');
 await page.getByLabel('Prefijo', { exact: true }).press('Tab');
 await page.getByRole('button', { name: 'Guardar y volver al lote', exact: true }).click();
 await page.getByRole('button', { name: 'Guardar borrador como copia', exact: true }).click();
 await expect(page).toHaveURL(/\/price-labels\/created-(?!1\/)[^/]+\/edit\?batch=\d+$/);
 await page.getByRole('button', { name: 'Volver al lote', exact: true }).click();
 await expect(page.getByLabel('Lista de precios')).toHaveValue('b');
 await expect(copies).toHaveValue('2');
 await expect(page.getByLabel('Cantidad de Artículo 2', { exact: true })).toHaveValue('1');
 await expect(frame.locator('.label-cell')).toHaveCount(3);
 await expect(frame.locator('.label-price').first()).toContainText('COPIA $ 80,50');
 console.log('PASS: conflict copy retains the batch and previews the new saved mold.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
