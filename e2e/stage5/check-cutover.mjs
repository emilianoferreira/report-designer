import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function checkCutover({ root, env, dotnetUiUrl, resultsDir }) {
  const requireServer = createRequire(path.join(root, 'server/package.json'));
  const { Client } = requireServer('pg');
  const db = new Client({ host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USERNAME, password: env.DB_PASSWORD, database: env.DB_NAME });
  assert.equal(env.DB_HOST, '127.0.0.1');
  assert.match(env.DB_NAME, /^stage0_[a-f0-9]{32}$/);
  const ids = [];
  const checks = [];
  async function request(uiUrl, method, route, status, data) {
    const response = await fetch(uiUrl + route, { method, signal: AbortSignal.timeout(10_000),
      ...(data === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }) });
    const text = await response.text();
    assert.equal(response.status, status, `${method} ${route}: ${text}`);
    if (method === 'DELETE') { assert.equal(text, ''); return; }
    assert.match(response.headers.get('content-type'), /^application\/json\b/);
    return JSON.parse(text);
  }
  async function routing(uiUrl, backend, expectedLog, otherLog) {
    // Both servers see the same DB. A unique malformed UUID proves which process handled
    // the proxy request, without adding a product endpoint/header or relying on differing data.
    const marker = `stage5-${backend}-${env.STAGE0_RUN_ID}`;
    assert.deepEqual(await request(uiUrl, 'GET', `/api/templates/${marker}`, 500), { statusCode: 500, message: 'Internal server error' });
    for (let attempt = 0; attempt < 30; attempt++) {
      if ((await readFile(path.join(resultsDir, expectedLog), 'utf8')).includes(marker)) {
        assert.ok(!(await readFile(path.join(resultsDir, otherLog), 'utf8')).includes(marker), 'request must reach only its selected backend');
        checks.push(`profile routes exclusively to ${backend}`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(`Selected backend did not receive the proxied request: ${backend}`);
  }
  await db.connect();
  try {
    assert.deepEqual((await db.query('SELECT run_id FROM stage0_test_guard')).rows, [{ run_id: env.STAGE0_RUN_ID }]);
    await routing(dotnetUiUrl, 'dotnet', 'dotnet-writes.log', 'api.log');
    await routing(env.STAGE0_UI_URL, 'nestjs', 'api.log', 'dotnet-writes.log');
    for (const fixtureName of ['report-a4', 'report-ticket-80', 'price-label']) {
      const fixture = JSON.parse(await readFile(path.join(root, 'e2e/stage0/fixtures', `${fixtureName}.json`), 'utf8'));
      const created = await request(dotnetUiUrl, 'POST', '/api/templates', 201, { ...fixture, nombre: fixture.nombre + ' stage5' });
      ids.push(created.id);
      assert.equal(created.version, 1);
      const route = `/api/templates/${created.id}`;
      assert.deepEqual(await request(env.STAGE0_UI_URL, 'GET', route, 200), created, 'NestJS rollback must load the row created through Angular/.NET');
      const design = { ...created.template_json, rollbackVerification: { backend: 'nestjs', unicode: 'ñ 漢字', number: 1.2345, optional: null } };
      const saved = await request(env.STAGE0_UI_URL, 'PUT', route + '/design', 200, { template_json: design });
      assert.equal(saved.version, 2);
      assert.deepEqual(await request(dotnetUiUrl, 'GET', route, 200), saved, 'returning to .NET must retain the NestJS save');
      const updated = await request(dotnetUiUrl, 'PUT', route, 200, { nombre: 'Retorno a .NET ñ', descripcion: null });
      assert.equal(updated.version, 3);
      assert.deepEqual(updated.template_json, design);
      assert.deepEqual(await request(env.STAGE0_UI_URL, 'GET', route, 200), updated);
      const stored = (await db.query('SELECT version, template_json FROM report_templates WHERE id=$1', [created.id])).rows[0];
      assert.deepEqual(stored, { version: 3, template_json: design });
      await request(dotnetUiUrl, 'DELETE', route, 200);
      assert.equal((await db.query('SELECT id FROM report_templates WHERE id=$1', [created.id])).rowCount, 0);
      checks.push(`${fixtureName}: .NET create → NestJS reload/save → .NET reload/update → NestJS reload → delete`);
    }
    await writeFile(path.join(resultsDir, 'stage5.json'), JSON.stringify({ passed: true, checks,
      configuration: env.STAGE6_PRODUCTION
        ? 'Production Nginx server block and compiled Angular; only loopback ports, upstream and static root are substituted.'
        : 'Real checked-in default and nestjs Angular profiles; only API port environment variables are overridden for isolation.' }, null, 2));
    console.log(`[stage5] ${checks.length} routing/rollback checks passed through ${env.STAGE6_PRODUCTION ? 'production Nginx' : 'the real Angular profiles'}.`);
  } finally {
    try { await db.query('DELETE FROM report_templates WHERE id=ANY($1::uuid[])', [ids]); }
    finally { await db.end(); }
  }
}
