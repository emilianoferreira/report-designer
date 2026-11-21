// Focused acceptance against this lab only. Requires API started with F5/study:api.
// Creates and removes its own mold; never resets or modifies existing study rows.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { root, database, loadState, assertOwnership, compose, sql, privateWrite } from './study-lab.mjs';

const state = await loadState();
await assertOwnership(state, true);
assert.equal(state.ready, true, 'Study setup must be complete');
const base = 'http://127.0.0.1:5080';
const checks = [];
let cookie = '', csrf = '', createdId;
function check(label) { checks.push(label); console.log('PASS ' + label); }
async function request(method, route, expected, body, headers = {}) {
  const response = await fetch(base + route, { method, redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, expected, `${method} ${route}: expected HTTP ${expected}`);
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
try {
  const health = await fetch(base + '/health/ready'); assert.equal(health.status, 200);
  assert.equal(await sql('SELECT DATABASE();'), database);
  assert.match(await sql("SHOW SESSION STATUS LIKE 'Ssl_cipher';"), /TLS_|AES|CHACHA/);
  assert.equal(await sql('SELECT @@global.time_zone;'), '+00:00');
  assert.equal(await sql('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE();', { admin: true }), '14');
  assert.equal(await sql('SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE();', { admin: true }), '18');
  const jsonChecks = await sql("SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND (CHECK_CLAUSE LIKE '%template_json%' OR CHECK_CLAUSE LIKE '%parametros%');", { admin: true });
  assert.equal(jsonChecks, '0');
  const grants = await sql("SHOW GRANTS FOR 'study_app'@'%';", { admin: true });
  assert.doesNotMatch(grants, /ALL PRIVILEGES|CREATE|ALTER|DROP|GRANT OPTION/);
  await assert.rejects(sql('SELECT 1 FROM auth_users LIMIT 0;'), /1142/);
  check('schema 001/002, 18 FK, UTC, verified TLS and limited accounts');
  await request('GET', '/api/auth/session', 401);
  await request('POST', '/api/auth/login', 403, { email: 'estudiante@example.test', password: state.passwords.login });
  let session = await request('POST', '/api/auth/login', 200, { email: 'estudiante@example.test', password: state.passwords.login }, { 'X-CSRF-Token': 'login' });
  csrf = session.csrf_token;
  assert.equal(session.role, 'editor');
  check('login, cookie session and login CSRF');
  const fixture = JSON.parse(await readFile(path.join(root, 'e2e/stage0/fixtures/report-a4.json'), 'utf8'));
  let mold = await request('POST', '/api/templates', 201, { nombre: 'Verificación estudio ' + Date.now(), template_json: fixture.template_json });
  createdId = mold.id;
  assert.match(createdId, /^[0-9a-f-]{36}$/);
  assert.equal(await sql(`SELECT COUNT(*) FROM report_templates WHERE id='${createdId}';`), '1');
  check('create through HTTP and observe committed SQL row');
  const originalVersion = mold.version;
  await request('PUT', '/api/templates/' + createdId, 403, { nombre: 'Rejected' }, { 'X-CSRF-Token': '' });
  mold = await request('PUT', '/api/templates/' + createdId, 200, { nombre: 'Estudio verificado' }, { 'If-Match': `"${mold.version}"` });
  assert.equal(await sql(`SELECT nombre FROM report_templates WHERE id='${createdId}';`), 'Estudio verificado');
  await request('PUT', '/api/templates/' + createdId, 409, { nombre: 'Rejected' }, { 'If-Match': `"${originalVersion}"` });
  await request('PUT', '/api/templates/' + createdId, 400, { nombre: 'Rejected' }, { 'If-Match': 'invalid' });
  mold = await request('PUT', '/api/templates/' + createdId + '/design', 200, { template_json: fixture.template_json }, { 'If-Match': `"${mold.version}"` });
  assert.deepEqual(JSON.parse(await sql(`SELECT template_json FROM report_templates WHERE id='${createdId}';`)), fixture.template_json);
  check('update/design, SQL persistence, missing CSRF 403, stale revision 409 and invalid revision 400');
  // No user request is in flight and only the owned MySQL is stopped/recreated.
  await compose('stop', 'mysql');
  await compose('up', '-d', '--wait', '--wait-timeout', '150', 'mysql');
  assert.equal(await sql(`SELECT COUNT(*) FROM report_templates WHERE id='${createdId}';`), '1');
  check('stop/start retains committed data');
  await assertOwnership(state, true);
  await compose('up', '-d', '--force-recreate', '--wait', '--wait-timeout', '150', 'mysql');
  await assertOwnership(state, true);
  const afterRestart = await request('GET', '/api/templates/' + createdId, 200);
  assert.equal(afterRestart.version, mold.version);
  check('container recreation retains data, session and revision in the named volume');
  const invoice = await request('GET', '/api/invoices/f1000000-0000-0000-0000-000000000001/data', 200);
  assert.equal(invoice.Total, 122); assert.equal(invoice.invoiceLines.length, 1);
  assert.equal(invoice.Impuestos[0].Valor, 22);
  check('MySQL invoice → InvoiceDataBuilder → HTTP JSON');
  session = await request('POST', '/api/auth/company', 200, { company_id: 'c1000000-0000-0000-0000-000000000002' });
  csrf = session.csrf_token;
  await request('POST', '/api/templates', 403, { nombre: 'Viewer rejected', template_json: {} });
  await request('GET', '/api/templates/' + createdId, 404);
  session = await request('POST', '/api/auth/company', 200, { company_id: 'c1000000-0000-0000-0000-000000000001' });
  csrf = session.csrf_token;
  check('company isolation, viewer write denied and session/CSRF rotation');
  await request('DELETE', '/api/templates/' + createdId, 200, undefined, { 'If-Match': `"${mold.version}"` });
  await request('GET', '/api/templates/' + createdId, 404);
  assert.equal(await sql(`SELECT COUNT(*) FROM report_templates WHERE id='${createdId}';`), '0');
  check('delete through HTTP and verify absence in SQL');
  await request('POST', '/api/auth/logout', 204);
  await request('GET', '/api/auth/session', 401);
  check('logout revokes the session');
  await privateWrite('verification.json', JSON.stringify({ passed: true, date: new Date().toISOString(), checks }, null, 2) + '\n');
} catch (error) {
  // Avoid dumping HTTP bodies, login payloads, headers or connection strings.
  console.error('Verification failed: ' + String(error.message).replaceAll(state.passwords.login, '[private]'));
  if (createdId) console.error('Own test row may remain for inspection: ' + createdId);
  process.exitCode = 1;
}
