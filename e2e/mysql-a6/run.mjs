import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {runA5} from '../mysql-a5/run.mjs';
import {checkBrowser} from '../mysql-a4/browser.mjs';
import {login,call} from '../stage8/check-security.mjs';
import {B} from '../stage8/check-security.mjs';
import {expect} from '@playwright/test';
const root=process.cwd(),checks=[];
const {directory,report}=await runA5({verify:async({mysql,directory})=>{
 const identity=await login(mysql.urls[0],mysql.users.alice),reportIds={};
 for(const key of ['report-a4','report-ticket-80']){const fixture=JSON.parse(await readFile('e2e/stage0/fixtures/'+key+'.json','utf8'));reportIds[key]=(await call(mysql.urls[0],identity,'POST','/api/templates',fixture,201)).id;}
 return checkBrowser({root,url:mysql.urls[0],user:mysql.users.multi,company:B,directory,exercise:async({page,origin})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=(method,suffix)=>page.waitForResponse(r=>r.request().method()===method&&new URL(r.url()).pathname.endsWith(suffix));
 await page.goto(origin+'/templates');
 await page.getByRole('button',{name:'+ Nuevo molde',exact:true}).click();
 await page.getByPlaceholder('Ej: Factura Contado - Empresa').fill('A6 web real');
 let pending=response('POST','/api/templates');await page.getByRole('button',{name:'Crear molde',exact:true}).click();
 let r=await pending;assert.equal(r.status(),201);const created=await r.json();
 let card=page.locator('.mold-card').filter({hasText:'A6 web real'});await expect(card).toBeVisible();
 await card.getByTitle('Editar metadatos').click();await page.getByPlaceholder('Descripción opcional del molde').fill('Persistido desde Angular');
 pending=response('PUT',created.id);await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();assert.equal((await pending).status(),200);
 pending=response('POST','/duplicate');await card.getByTitle('Duplicar',{exact:true}).click();assert.equal((await pending).status(),201);
 await page.reload();card=page.locator('.mold-card').filter({has:page.getByRole('heading',{name:'A6 web real',exact:true})});await expect(card).toContainText('Persistido desde Angular');
 await card.getByTitle('Eliminar',{exact:true}).click();pending=response('DELETE',created.id);await page.getByRole('button',{name:'Eliminar',exact:true}).click();assert.equal((await pending).status(),200);
 checks.push('Angular real: create metadata edit duplicate reload delete on MySQL');
 await page.goto(origin+'/price-labels');
 const name=page.getByLabel('Nombre de la plantilla');await name.fill('A6 etiqueta real');await name.press('Tab');
 pending=response('POST','/api/templates');await page.getByRole('button',{name:'Guardar',exact:true}).click();r=await pending;assert.equal(r.status(),201);const label=await r.json();await expect(page.getByRole('button',{name:'Guardar',exact:true})).toBeEnabled();await expect(page.locator('.template-select')).toHaveValue(label.id);
 await name.fill('A6 etiqueta editada');await name.press('Tab');pending=response('PUT',label.id);await page.getByRole('button',{name:'Guardar',exact:true}).click();r=await pending;assert.equal(r.status(),200);assert.ok(await r.request().headerValue('if-match'),'If-Match must be sent by '+r.url());
 await page.reload();await page.locator('.template-menu summary').click();await page.locator('.template-select').selectOption(label.id);await expect(name).toHaveValue('A6 etiqueta editada');
 await page.getByRole('button',{name:'Vista previa',exact:true}).click();await expect(page.frameLocator('iframe').locator('body')).toContainText(/\S/);await page.screenshot({path:directory+'/a6-label-preview.png',fullPage:true});
 checks.push('Angular real: label create If-Match save reload preview');
 await page.goto(origin+'/templates');
 const rows=await page.evaluate(()=>fetch('/api/templates').then(r=>r.json()));
 for(const key of ['report-a4','report-ticket-80']){
 const target=rows.find(x=>x.id===reportIds[key]);
 assert.ok(target,'report fixture available');await page.goto(origin+'/designer/'+target.id);await page.locator('app-design-canvas').waitFor();
 const count=await page.locator('.element-wrapper').count();assert.ok(count>0);await page.locator('.element-wrapper').first().click();await page.keyboard.press('Delete');
 pending=response('PUT','/design');await page.getByRole('button',{name:'Guardar',exact:true}).click();r=await pending;assert.equal(r.status(),200);assert.equal(await r.request().headerValue('if-match'),null,'report editor retains legacy write contract');
 await page.reload();await expect(page.locator('.element-wrapper')).toHaveCount(count-1);
 await page.getByRole('button',{name:'Vista Previa',exact:true}).click();await expect(page.getByText('Preparación de la vista previa · carga finalizada')).toBeVisible();await expect(page.frameLocator('iframe').locator('body')).toContainText(/\S/);await page.screenshot({path:directory+'/a6-'+key+'-web.png',fullPage:true});
 }
 checks.push('Angular A4 and ticket edit legacy save reload and sample preview; real invoice data renderer covered separately by A5');
 assert.deepEqual(errors,[]);checks.push('no browser page errors');await page.goto(origin+'/templates');
 }});
}});
await mkdir('e2e/mysql-a6/evidence',{recursive:true});await writeFile('e2e/mysql-a6/evidence/run.json',JSON.stringify({passed:report.passed,directory,checks,functional:report.functional},null,2));
console.log('A6 passed: '+directory);
