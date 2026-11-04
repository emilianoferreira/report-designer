import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { test, expect, fixture, createTemplate, deleteTemplate, COMPANY_1, COMPANY_2 } from '../../stage0/support';

const users = JSON.parse(readFileSync(process.env['STAGE8_TEST_USERS']!, 'utf8'));
async function login(context: any, user: any) {
  const response = await context.request.post('/api/auth/login', { data: user, headers: { 'X-CSRF-Token': 'login' } });
  expect(response.status()).toBe(200);
  return response.json();
}

test('anonymous navigation requires login and ignores legacy localStorage documents', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: process.env['STAGE0_UI_URL'], storageState: { cookies: [], origins: [] } });
  try {
    await context.addInitScript(() => {
      localStorage.setItem('zureo_template_molds', JSON.stringify([{id:'private-cache',name:'DOCUMENTO PRIVADO EN CACHE'}]));
      localStorage.setItem('zureo_price_label_templates', JSON.stringify([{id:'private-cache',name:'ETIQUETA PRIVADA EN CACHE'}]));
    });
    const page = await context.newPage();
    await page.goto('/templates');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('DOCUMENTO PRIVADO EN CACHE')).toHaveCount(0);
    await page.getByLabel('Correo electrónico').fill(users.alice.email);
    await page.getByLabel('Contraseña', {exact:true}).fill(users.alice.password);
    await page.getByRole('button',{name:'Ingresar',exact:true}).click();
    await expect(page).toHaveURL(/\/templates$/);
    await expect(page.getByText(users.alice.email,{exact:true})).toBeVisible();
    await expect(page.getByText('DOCUMENTO PRIVADO EN CACHE')).toHaveCount(0);
    await page.goto('/price-labels');
    await expect(page.locator('.template-select')).not.toContainText('ETIQUETA PRIVADA EN CACHE');
    const cookies=await context.cookies();
    const session=cookies.find((c:any)=>c.name==='rd_session')!;
    expect(session.httpOnly).toBe(true); expect(session.sameSite).toBe('Strict');
    if (process.env['STAGE9_HTTPS']) expect(session.secure).toBe(true);
    expect(await page.evaluate(()=>document.cookie)).not.toContain('rd_session');
  } finally { await context.close(); }
});

test('company switch clears lists and editor state; logout revokes the cookie', async ({ browser, db }) => {
  const ids=[randomUUID(),randomUUID()];
  for (let n=0;n<2;n++) await db.query('INSERT INTO report_templates(id,company_id,nombre,template_json) VALUES($1,$2,$3,$4)',
    [ids[n],n===0?COMPANY_1:COMPANY_2,'Privado '+n,fixture('report-a4').template_json]);
  const context=await browser.newContext({baseURL:process.env['STAGE0_UI_URL'],storageState:{cookies:[],origins:[]},viewport:{width:1600,height:1000}});
  try {
    await login(context,users.multi);
    const page=await context.newPage();
    await page.goto('/templates');
    await expect(page.getByRole('heading',{name:'Privado 0',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Privado 1',exact:true})).toHaveCount(0);
    await page.goto('/designer/'+ids[0]);
    const initial=fixture('report-a4').template_json.template.sections.header.elements[0].content;
    await page.locator('.element-wrapper').filter({has:page.locator('.text-element').filter({hasText:initial})}).click();
    await page.locator('app-properties-panel').getByRole('button',{name:'Datos',exact:true}).click();
    const text=page.locator('app-properties-panel textarea').first();
    await text.fill('Borrador privado de A');await text.press('Tab');
    const previous=(await context.cookies()).find(c=>c.name==='rd_session')!.value;
    let dialogs=0;
    page.on('dialog',dialog=>{dialogs++;return dialog.accept();});
    await page.getByLabel('Empresa activa').selectOption(COMPANY_2);
    await expect(page.getByRole('heading',{name:'Privado 1',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Privado 0',exact:true})).toHaveCount(0);
    expect(dialogs).toBe(1);
    expect((await db.query('SELECT version FROM report_templates WHERE id=$1',[ids[0]])).rows[0].version).toBe(1);
    expect((await context.cookies()).find(c=>c.name==='rd_session')!.value).not.toBe(previous);
    await page.goto('/designer/'+ids[0]);
    await expect(page).toHaveURL(/\/templates$/);
    await expect(page.getByRole('heading',{name:'Privado 0',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.request.get('/api/templates')).status()).toBe(401);
    expect((await db.query('SELECT count(*)::int AS n FROM auth_sessions WHERE token_hash=$1',
      [createHash('sha256').update(previous).digest('hex')])).rows[0].n).toBe(0);
  } finally {
    await context.close();
    await db.query('DELETE FROM report_templates WHERE id=ANY($1::uuid[])',[ids]);
  }
});

test('expired session cannot save or fall back locally; unsaved report remains in the editor', async ({ api, browser, db }) => {
  const row=await createTemplate(api,'report-a4',' expiry');
  const context=await browser.newContext({baseURL:process.env['STAGE0_UI_URL'],storageState:{cookies:[],origins:[]},viewport:{width:1600,height:1000}});
  try {
    await login(context,users.alice);
    const page=await context.newPage();
    await page.goto('/designer/'+row.id);
    await expect(page).toHaveURL(new RegExp('/designer/'+row.id+'$'));
    const initial=fixture('report-a4').template_json.template.sections.header.elements[0].content;
    await page.locator('.element-wrapper').filter({has:page.locator('.text-element').filter({hasText:initial})}).click();
    await page.locator('app-properties-panel').getByRole('button',{name:'Datos',exact:true}).click();
    const text=page.locator('app-properties-panel textarea').first();
    await text.fill('Cambio pendiente tras vencimiento'); await text.press('Tab');
    const token=(await context.cookies()).find(c=>c.name==='rd_session')!.value;
    await db.query("UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[createHash('sha256').update(token).digest('hex')]);
    const response=page.waitForResponse(r=>r.url().endsWith('/design')&&r.request().method()==='PUT');
    await page.getByRole('button',{name:'Guardar',exact:true}).click();
    expect((await response).status()).toBe(401);
    await expect(page.getByRole('alert')).toContainText('La sesión venció');
    await expect(page.getByRole('button',{name:'Guardar',exact:true})).toBeEnabled();
    await expect(page.locator('.text-element').filter({hasText:'Cambio pendiente tras vencimiento'})).toBeVisible();
    expect((await db.query('SELECT version,template_json FROM report_templates WHERE id=$1',[row.id])).rows[0]).toEqual({version:1,template_json:row.template_json});
    expect(await page.evaluate(()=>localStorage.getItem('zureo_template_molds'))).toBeNull();
  } finally { await context.close(); await deleteTemplate(api,row.id); }
});
