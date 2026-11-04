import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { provisionUser } from '../../scripts/provision-user.mjs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../server/package.json', import.meta.url));
const Ajv = require('ajv');
const document = JSON.parse(await readFile(new URL('../../contracts/openapi.auth.json', import.meta.url), 'utf8'));
const validateSession = new Ajv({strict:false,allErrors:true}).compile(document.components.schemas.Session);

export const A = 'c1000000-0000-0000-0000-000000000001';
export const B = 'c1000000-0000-0000-0000-000000000002';
export async function seedIdentities(db) {
  const password = randomBytes(24).toString('hex');
  const users = {};
  for (const [name, companies] of Object.entries({ alice: [{ id:A, role:'editor' }], bob: [{ id:B, role:'editor' }],
    multi: [{ id:A, role:'editor' },{ id:B, role:'editor' }], viewer: [{ id:A, role:'viewer' }] })) {
    users[name] = { email: `${name}@stage8.invalid`, password,
      id: await provisionUser(db, { email: `${name}@stage8.invalid`, password, companies }) };
  }
  return users;
}

export async function login(url, user, fetcher = globalThis.fetch) {
  const response = await fetcher(url + '/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':'login'}, body:JSON.stringify(user) });
  assert.equal(response.status, 200, 'login');
  const header = response.headers.get('set-cookie');
  assert.match(header, /HttpOnly/i); assert.match(header, /SameSite=Strict/i);
  const session = await response.json();
  assert.ok(validateSession(session),JSON.stringify(validateSession.errors));
  return { cookie: header.split(';')[0], session, header };
}
export async function call(url, identity, method, route, body, expected=200, overrides={}, fetcher=globalThis.fetch) {
  const response = await fetcher(url+route, { method, headers: {
    ...(identity ? { cookie:identity.cookie, 'X-CSRF-Token':identity.session.csrf_token } : {}),
    ...(body === undefined ? {} : {'Content-Type':'application/json'}), ...overrides },
    ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
  assert.equal(response.status, expected, `${method} ${route}: ${await response.clone().text()}`);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  if (expected===204 || method==='DELETE' && expected===200) { assert.equal(await response.text(), ''); return; }
  return response.json();
}

export async function checkSecurity({urls, db, users, root, resultsDir}) {
  let assertions = 0;
  const check = async (...args) => { assertions++; return call(...args); };
  const owned = [];
  const original = JSON.parse(await readFile(path.join(root,'contracts/openapi.json'),'utf8'));
  for (const schema of ['Template','InvoiceSummary','InvoiceData','EditorDocument','InvoiceLine'])
    assert.deepEqual(document.components.schemas[schema],original.components.schemas[schema]);
  const applicationState = async () => {
    const result = {};
    for (const table of ['companies','branches','contacts','currencies','invoice_types','articles','invoices','invoice_lines','invoice_taxes','report_templates'])
      result[table] = (await db.query(`SELECT jsonb_agg(t ORDER BY id) AS rows FROM ${table} t`)).rows[0].rows;
    return result;
  };
  const initialState = await applicationState();
  // Original application tables are independently checked around denied operations.
  const state = async () => (await db.query(`SELECT jsonb_agg(t ORDER BY id) AS rows FROM report_templates t`)).rows[0].rows;
  for (const url of urls) {
    const alice = await login(url, users.alice), bob = await login(url, users.bob);
    const viewer = await login(url, users.viewer), multi = await login(url, users.multi);
    for (const [method,route] of [['GET','/api/templates'],['GET','/api/invoices'],['POST','/api/templates'],
      ['GET',`/api/templates/${A}`],['PUT',`/api/templates/${A}`],['PUT',`/api/templates/${A}/design`],
      ['POST',`/api/templates/${A}/duplicate`],['DELETE',`/api/templates/${A}`],['GET',`/api/invoices/${A}/data`]])
      await check(url,null,method,route,['POST','PUT'].includes(method)?{}:undefined,401);
    await check(url,null,'GET','/api/templates',undefined,401,{cookie:'rd_session='+'a'.repeat(64)});
    await check(url,null,'POST','/api/auth/login',users.alice,403);
    await check(url,null,'POST','/api/auth/login',users.alice,403,{'X-CSRF-Token':'login','Sec-Fetch-Site':'cross-site'});
    await check(url,null,'POST','/api/auth/login',{email:users.alice.email,password:'wrong'},401,{'X-CSRF-Token':'login'});
    const identity = await check(url,alice,'GET','/api/auth/session');
    assert.equal(identity.company_id,A); assert.deepEqual(identity.companies.map(c=>c.id),[A]);
    assert.equal(identity.password_hash,undefined); assert.equal(identity.token,undefined);
    for (const [who,company] of [[alice,A],[bob,B]]) {
      const list = await check(url,who,'GET','/api/templates');
      assert.ok(list.every(t=>t.company_id===company));
      const invoices = await check(url,who,'GET','/api/invoices');
      const sqlInvoices = (await db.query('SELECT id FROM invoices WHERE company_id=$1 ORDER BY fecha DESC',[company])).rows;
      assert.deepEqual(invoices.map(i=>i.id),sqlInvoices.map(i=>i.id));
      for (const invoice of invoices) {
        const data = await check(url,who,'GET',`/api/invoices/${invoice.id}/data`);
        assert.deepEqual(data,(await db.query('SELECT build_invoice_data($1) AS data',[invoice.id])).rows[0].data);
      }
    }
    const created = [];
    for (const name of ['report-a4','report-ticket-80','price-label']) {
      const payload = JSON.parse(await readFile(path.join(root,'e2e/stage0/fixtures',name+'.json'),'utf8'));
      const a = await check(url,alice,'POST','/api/templates',payload,201);
      const b = await check(url,bob,'POST','/api/templates',{...payload,company_id:B},201);
      created.push(a,b); owned.push(a.id,b.id);
      assert.equal(a.company_id,A); assert.equal(b.company_id,B);
      assert.deepEqual(a.template_json,payload.template_json);
      const before = await state();
      for (const [who,foreign] of [[alice,b],[bob,a]]) {
        for (const [method,suffix,body] of [['GET','',undefined],['PUT','',{nombre:'stolen'}],['PUT','/design',{template_json:{stolen:true}}],['POST','/duplicate',{}],['DELETE','',undefined]]) {
          const denied = await check(url,who,method,`/api/templates/${foreign.id}${suffix}`,body,404);
          assert.equal(denied.message,`Template ${foreign.id} not found`);
        }
      }
      await check(url,alice,'PUT',`/api/templates/${a.id}/design`,{template_json:{stolen:true}},403,{'X-CSRF-Token':''});
      await check(url,alice,'PUT',`/api/templates/${a.id}/design`,{template_json:{}},403,{'Sec-Fetch-Site':'cross-site'});
      for (const field of ['company_id','id','created_at','updated_at'])
        await check(url,alice,'PUT',`/api/templates/${a.id}`,{[field]:field==='company_id'?B:b.id},403);
      await check(url,alice,'PUT',`/api/templates/${a.id}`,{company:{id:B}},403);
      await check(url,alice,'PUT',`/api/templates/${a.id}`,{based_on:b.id},404);
      await check(url,alice,'POST','/api/templates',{...payload,company_id:B},403);
      await check(url,viewer,'POST','/api/templates',payload,403);
      await check(url,viewer,'PUT',`/api/templates/${a.id}/design`,{template_json:{}},403);
      await check(url,viewer,'POST',`/api/templates/${a.id}/duplicate`,{},403);
      await check(url,viewer,'DELETE',`/api/templates/${a.id}`,undefined,403);
      assert.deepEqual(await state(),before,'Denied operations must not change any template row');
      const next = {...a.template_json,authRoundTrip:{unicode:'ñ 漢字',amount:1.2345}};
      const saved = await check(url,alice,'PUT',`/api/templates/${a.id}/design`,{template_json:next});
      assert.equal(saved.version,2); assert.deepEqual(saved.template_json,next);
      assert.deepEqual((await db.query('SELECT template_json FROM report_templates WHERE id=$1',[a.id])).rows[0].template_json,next);
      const copy = await check(url,alice,'POST',`/api/templates/${a.id}/duplicate`,{},201);
      assert.equal(copy.version,1); assert.deepEqual(copy.template_json,next); owned.push(copy.id);
      const updated = await check(url,alice,'PUT',`/api/templates/${a.id}`,{nombre:'Nombre autorizado',tags:['ñ'],estado:'borrador'});
      assert.equal(updated.nombre,'Nombre autorizado'); assert.equal(updated.version,3);
    }
    await check(url,alice,'GET',`/api/templates?companyId=${B}`,undefined,403);
    await check(url,alice,'GET',`/api/invoices?companyId=${B}`,undefined,403);
    await check(url,multi,'GET',`/api/templates?companyId=${B}`,undefined,403);
    const foreignInvoice = (await db.query('SELECT id FROM invoices WHERE company_id=$1 LIMIT 1',[B])).rows[0].id;
    await check(url,alice,'GET',`/api/invoices/${foreignInvoice}/data`,undefined,404);
    const ownInvoice = (await db.query('SELECT id,contact_id,branch_id,type_id FROM invoices WHERE company_id=$1 LIMIT 1',[A])).rows[0];
    for (const [field,table] of [['contact_id','contacts'],['branch_id','branches'],['type_id','invoice_types']]) {
      const foreign = (await db.query(`SELECT id FROM ${table} WHERE company_id=$1 LIMIT 1`,[B])).rows[0].id;
      await db.query(`UPDATE invoices SET ${field}=$1 WHERE id=$2`,[foreign,ownInvoice.id]);
      try { await check(url,alice,'GET',`/api/invoices/${ownInvoice.id}/data`,undefined,404); }
      finally { await db.query(`UPDATE invoices SET ${field}=$1 WHERE id=$2`,[ownInvoice[field],ownInvoice.id]); }
    }
    await check(url,alice,'POST','/api/auth/company',{company_id:B},403);
    await check(url,alice,'POST','/api/auth/logout',{},403,{'X-CSRF-Token':'wrong'});
    const switched = await fetch(url+'/api/auth/company',{method:'POST',headers:{cookie:multi.cookie,'X-CSRF-Token':multi.session.csrf_token,'Content-Type':'application/json'},body:JSON.stringify({company_id:B})});
    assert.equal(switched.status,200);
    const selected = {cookie:switched.headers.get('set-cookie').split(';')[0],session:await switched.json()};
    assert.equal(selected.session.company_id,B); assert.notEqual(selected.cookie,multi.cookie);
    await check(url,multi,'GET','/api/templates',undefined,401);
    await check(url,selected,'POST','/api/auth/company',{company_id:A},403,{'X-CSRF-Token':multi.session.csrf_token});
    assert.ok((await check(url,selected,'GET','/api/templates')).every(t=>t.company_id===B));
    await check(url,selected,'GET',`/api/templates/${created[0].id}`,undefined,404);
    await check(url,alice,'POST','/api/auth/logout',{},204);
    await check(url,alice,'GET','/api/templates',undefined,401);
    const expiring = await login(url,users.alice);
    await db.query("UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",[users.alice.id]);
    await check(url,expiring,'GET','/api/templates',undefined,401);
    const revoked = await login(url,users.alice);
    await db.query('DELETE FROM auth_memberships WHERE user_id=$1 AND company_id=$2',[users.alice.id,A]);
    await check(url,revoked,'GET','/api/templates',undefined,401);
    await db.query("INSERT INTO auth_memberships VALUES($1,$2,'editor')",[users.alice.id,A]);
    const disabled = await login(url,users.bob);
    await db.query('UPDATE auth_users SET active=false WHERE id=$1',[users.bob.id]);
    await check(url,disabled,'GET','/api/templates',undefined,401);
    await db.query('UPDATE auth_users SET active=true WHERE id=$1',[users.bob.id]);
    await db.query("UPDATE auth_memberships SET role='viewer' WHERE user_id=$1",[users.bob.id]);
    await check(url,disabled,'POST','/api/templates',{nombre:'denied',template_json:{}},403);
    await db.query("UPDATE auth_memberships SET role='editor' WHERE user_id=$1",[users.bob.id]);
    for (let n=0;n<10;n++) await check(url,null,'POST','/api/auth/login',{email:'nonexistent@stage8.invalid',password:'wrong'},401,{'X-CSRF-Token':'login'});
    await check(url,null,'POST','/api/auth/login',{email:'nonexistent@stage8.invalid',password:'wrong'},429,{'X-CSRF-Token':'login'});
    // Independent endpoints share the rate limit; clear only this disposable test DB for the next run.
    await db.query('DELETE FROM auth_login_limits');
  }
  for (let n=0;n<11;n++) await check(urls[n%2],null,'POST','/api/auth/login',
    {email:'shared-limit@stage8.invalid',password:'wrong'},n<10?401:429,{'X-CSRF-Token':'login'});
  await db.query('DELETE FROM auth_login_limits');
  // Authentication issued by either API is accepted by the other without re-login.
  for (const [issuer,target] of [[urls[0],urls[1]],[urls[1],urls[0]]]) {
    const identity = await login(issuer,users.alice);
    assert.deepEqual(await check(target,identity,'GET','/api/auth/session'),await check(issuer,identity,'GET','/api/auth/session'));
    const ownInvoice=(await db.query('SELECT id FROM invoices WHERE company_id=$1 LIMIT 1',[A])).rows[0].id;
    assert.deepEqual(await check(target,identity,'GET',`/api/invoices/${ownInvoice}/data`),await check(issuer,identity,'GET',`/api/invoices/${ownInvoice}/data`));
    await check(target,identity,'POST','/api/auth/logout',{},204);
    await check(issuer,identity,'GET','/api/auth/session',undefined,401);
  }
  await db.query('DELETE FROM report_templates WHERE id=ANY($1::uuid[])',[owned]);
  assert.deepEqual(await applicationState(),initialState,'Security checks must preserve all original application tables');
  await writeFile(path.join(resultsDir,'security.json'),JSON.stringify({passed:true,checkedRequests:assertions,backends:urls.length,
    checks:['anonymous','login','CSRF','roles','tenant lists','cross-tenant CRUD','immutable ownership','based_on','SQL unchanged on denial','invoice SQL parity','session rotation','expiry','membership revocation','disabled user','shared rate limit','cross-backend session and logout']},null,2));
  return assertions;
}
