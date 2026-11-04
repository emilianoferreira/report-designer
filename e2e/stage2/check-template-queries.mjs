import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function checkTemplateQueries({ root, env, baseUrl, resultsDir }) {
  const requireServer = createRequire(path.join(root, 'server/package.json'));
  const { Client } = requireServer('pg');
  const Ajv = requireServer('ajv');
  const contract = JSON.parse(await readFile(path.join(root, 'contracts/openapi.json'), 'utf8'));
  const ajv = new Ajv({ strict: false, allErrors: true });
  ajv.addSchema(contract, 'urn:report-designer:stage2');
  const template = { $ref: 'urn:report-designer:stage2#/components/schemas/Template' };
  const validators = {
    row: ajv.compile(template), list: ajv.compile({ type: 'array', items: template }),
    404: ajv.compile({ $ref: 'urn:report-designer:stage2#/components/schemas/NotFoundError' }),
    500: ajv.compile({ $ref: 'urn:report-designer:stage2#/components/schemas/ServerError' }),
  };
  const company1 = 'c1000000-0000-0000-0000-000000000001';
  const company2 = 'c1000000-0000-0000-0000-000000000002';
  const missing = '00000000-0000-0000-0000-000000000000';
  const ids = [];
  const cases = [];
  assert.match(env.DB_NAME, /^stage0_[a-f0-9]{32}$/);
  assert.equal(env.DB_HOST, '127.0.0.1');
  const db = new Client({ host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USERNAME, password: env.DB_PASSWORD, database: env.DB_NAME,
    ssl: env.STAGE0_CA_FILE ? { ca: await readFile(env.STAGE0_CA_FILE, 'utf8'), rejectUnauthorized: true } : undefined });
  await db.connect();

  async function json(url, status, options) {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10_000) });
    const text = await response.text();
    assert.equal(response.status, status, `${url}: ${text}`);
    assert.match(response.headers.get('content-type'), /^application\/json\b/);
    return JSON.parse(text);
  }
  async function parity(route, status, name) {
    const legacy = await json(env.STAGE0_API_URL + route, status);
    const current = await json(baseUrl + route, status);
    const validate = validators[status === 200 ? (Array.isArray(current) ? 'list' : 'row') : status];
    assert.ok(validate(current), JSON.stringify(validate.errors));
    assert.deepEqual(current, legacy, name);
    cases.push({ name, status });
    return current;
  }
  const snapshot = async () => (await db.query('SELECT to_jsonb(t) AS row FROM report_templates t ORDER BY id')).rows;
  try {
    assert.deepEqual((await db.query('SELECT run_id FROM stage0_test_guard')).rows, [{ run_id: env.STAGE0_RUN_ID }]);
    assert.deepEqual(await parity('/api/templates', 200, 'empty default company'), []);
    for (const name of ['report-a4', 'report-ticket-80', 'price-label', 'price-label']) {
      const payload = JSON.parse(await readFile(path.join(root, 'e2e/stage0/fixtures', `${name}.json`), 'utf8'));
      if (ids.length === 3) { payload.company_id = company2; payload.nombre += ' Empresa 2'; }
      const created = await json(env.STAGE0_API_URL + '/api/templates', 201, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      ids.push(created.id);
    }
    // The database permits nulls even where the legacy entity's TypeScript declaration does not.
    await db.query(`UPDATE report_templates SET descripcion = NULL, version = NULL, autor = NULL, tags = NULL,
      estado = NULL, created_at = NULL, updated_at = NULL WHERE id = $1`, [ids[1]]);
    await db.query(`UPDATE report_templates SET descripcion = '', autor = 'Autor ñ 漢字', tags = ARRAY['uno', 'ñ', ''],
      based_on = $2, created_at = '2026-01-02T03:04:05.123987+03', updated_at = '2026-02-01T12:00:00.987654Z' WHERE id = $1`, [ids[0], ids[1]]);
    await db.query(`UPDATE report_templates SET updated_at = '2026-01-01T00:00:00Z' WHERE id = $1`, [ids[2]]);
    const before = await snapshot();
    const listed = await parity('/api/templates', 200, 'default company, mixed documents, null timestamp ordering');
    assert.deepEqual(listed.map(row => row.id), [ids[1], ids[0], ids[2]]);
    assert.equal(listed[1].created_at, '2026-01-02T00:04:05.123Z');
    assert.equal(listed[1].updated_at, '2026-02-01T12:00:00.987Z');
    assert.equal(listed[0].version, null);
    assert.equal(listed[0].tags, null);
    assert.equal(listed[0].created_at, null);
    await parity(`/api/templates?companyId=${company1}`, 200, 'explicit company');
    const other = await parity(`/api/templates?companyId=${company2}`, 200, 'second company');
    assert.deepEqual(other.map(row => row.id), [ids[3]]);
    assert.deepEqual(await parity(`/api/templates?companyId=${missing}`, 200, 'unknown company'), []);
    for (const id of ids) await parity(`/api/templates/${id}`, 200, 'complete document ' + id);
    await parity(`/api/templates/${ids[0].toUpperCase()}`, 200, 'uppercase UUID');
    await parity(`/api/templates/${ids[0].replaceAll('-', '')}`, 200, 'PostgreSQL compact UUID');
    await parity(`/api/templates/${ids[3]}?companyId=${company1}`, 200, 'legacy individual lookup ignores company');
    await parity(`/api/templates/${missing}`, 404, 'missing UUID');
    await parity(`/api/templates/${missing.replaceAll('-', '')}`, 404, 'missing UUID preserves original text in message');
    for (const value of ['', '  ', 'invalid', "x' OR 1=1 --"]) {
      await parity(`/api/templates?companyId=${encodeURIComponent(value)}`, 500, 'invalid company ' + value);
    }
    for (const value of ['  ', 'not-a-uuid', "x' OR 1=1 --"]) {
      await parity(`/api/templates/${encodeURIComponent(value)}`, 500, 'invalid id ' + value);
    }
    assert.deepEqual(await snapshot(), before, 'GET endpoints must not mutate rows or timestamps');

    await json(`${env.STAGE0_API_URL}/api/templates/${ids[2]}`, 200, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nombre: 'Cambio desde NestJS ñ', descripcion: null }),
    });
    const design = { ...JSON.parse(await readFile(path.join(root, 'e2e/stage0/fixtures/price-label.json'), 'utf8')).template_json,
      future: { decimals: 123.4567, nullable: null, caseSensitive: { Nombre: 'ñ', nombre: '漢字' }, array: [1, true, null] } };
    await json(`${env.STAGE0_API_URL}/api/templates/${ids[2]}/design`, 200, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ template_json: design }),
    });
    const changed = await parity(`/api/templates/${ids[2]}`, 200, 'fresh state after Nest metadata and design writes');
    assert.deepEqual(changed.template_json, design);
    assert.equal(changed.version, 3);
    await parity('/api/templates', 200, 'fresh ordering after Nest writes');
    await db.query('DELETE FROM report_templates WHERE id = $1', [ids[2]]);
    await parity(`/api/templates/${ids[2]}`, 404, 'deleted row is not cached');
    await writeFile(path.join(resultsDir, 'stage2.json'), JSON.stringify({ passed: true, comparisons: cases.length, cases }, null, 2));
    console.log(`[stage2] ${cases.length} direct NestJS/.NET comparisons passed (no response normalization).`);
  } finally {
    try {
      await db.query('UPDATE report_templates SET based_on = NULL WHERE id = ANY($1::uuid[])', [ids]);
      await db.query('DELETE FROM report_templates WHERE id = ANY($1::uuid[])', [ids]);
    } finally { await db.end(); }
  }
}
