import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function checkTemplateCommands({ root, env, baseUrl, resultsDir }) {
  const requireServer = createRequire(path.join(root, 'server/package.json'));
  const { Client } = requireServer('pg');
  const Ajv = requireServer('ajv');
  const contract = JSON.parse(await readFile(path.join(root, 'contracts/openapi.json'), 'utf8'));
  const ajv = new Ajv({ strict: false, allErrors: true });
  ajv.addSchema(contract, 'urn:report-designer:stage3');
  const validate = ajv.compile({ $ref: 'urn:report-designer:stage3#/components/schemas/Template' });
  const db = new Client({ host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USERNAME, password: env.DB_PASSWORD, database: env.DB_NAME,
    ssl: env.STAGE0_CA_FILE ? { ca: await readFile(env.STAGE0_CA_FILE, 'utf8'), rejectUnauthorized: true } : undefined });
  const urls = [env.STAGE0_API_URL, baseUrl];
  const ids = [];
  const cases = [];
  const missing = '00000000-0000-0000-0000-000000000000';
  assert.match(env.DB_NAME, /^stage0_[a-f0-9]{32}$/);
  assert.equal(env.DB_HOST, '127.0.0.1');
  await db.connect();
  async function request(index, method, route, data, status) {
    const response = await fetch(urls[index] + route, { method, signal: AbortSignal.timeout(10_000),
      ...(data === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }) });
    const text = await response.text();
    assert.equal(response.status, status, `${index ? '.NET' : 'Nest'} ${method} ${route}: ${text}`);
    if (!text) { assert.equal(method, 'DELETE'); return ''; }
    assert.match(response.headers.get('content-type'), /^application\/json\b/);
    const body = JSON.parse(text);
    if (status === 201) ids.push(body.id);
    return body;
  }
  async function stored(index, row, omitDesign = false) {
    assert.match(row.id, /^[0-9a-f-]{36}$/);
    for (const key of ['created_at', 'updated_at']) if (row[key] !== null) assert.match(row[key], /^\d{4}-\d{2}-\d{2}T.*\.\d{3}Z$/);
    const persisted = (await db.query('SELECT * FROM report_templates WHERE id=$1', [row.id])).rows[0];
    assert.ok(persisted, 'write must persist a row');
    for (const key of ['created_at', 'updated_at']) persisted[key] = persisted[key]?.toISOString() ?? null;
    const loaded = await request(index, 'GET', `/api/templates/${row.id}`, undefined, 200);
    assert.deepEqual(loaded, persisted, 'GET must match SQL');
    if (omitDesign) delete persisted.template_json;
    assert.deepEqual(row, persisted, 'write response must match SQL, except legacy omitted design');
    if (!omitDesign) assert.ok(validate(row), JSON.stringify(validate.errors));
  }
  function normalized(row, creation, parents) {
    if (typeof row !== 'object' || row.statusCode) return row;
    const result = { ...row, id: '<row-id>' };
    if (parents?.includes(result.based_on)) result.based_on = '<parent-id>';
    if (creation) result.created_at = '<generated-utc>';
    if (result.updated_at !== null) result.updated_at = '<generated-utc>';
    return result;
  }
  async function pair(method, route, data, status, name, options = {}) {
    const result = [];
    for (let index = 0; index < 2; index++) {
      result[index] = await request(index, method, typeof route === 'function' ? route(index) : route,
        typeof data === 'function' ? data(index) : data, status);
      if (status === 200 && method !== 'DELETE' || status === 201) await stored(index, result[index], options.omitDesign);
    }
    assert.deepEqual(normalized(result[1], options.creation, options.parents), normalized(result[0], options.creation, options.parents), name);
    cases.push({ name, method, status });
    return result;
  }
  const snapshot = async () => (await db.query('SELECT to_jsonb(t) AS row FROM report_templates t ORDER BY id')).rows;
  try {
    assert.deepEqual((await db.query('SELECT run_id FROM stage0_test_guard')).rows, [{ run_id: env.STAGE0_RUN_ID }]);
    for (const fixtureName of ['report-a4', 'report-ticket-80', 'price-label']) {
      const fixture = JSON.parse(await readFile(path.join(root, 'e2e/stage0/fixtures', fixtureName + '.json'), 'utf8'));
      const rows = await pair('POST', '/api/templates', fixture, 201, fixtureName + ': create', { creation: true });
      assert.deepEqual(rows[1].template_json, fixture.template_json);
      const pairIds = rows.map(row => row.id);
      await db.query("UPDATE report_templates SET created_at='2026-01-01T00:00:00Z', updated_at='2026-01-01T00:00:00Z' WHERE id=ANY($1::uuid[])", [pairIds]);
      const route = index => `/api/templates/${pairIds[index]}`;
      let updated = await pair('PUT', route, { nombre: 'Actualizado ñ 漢字', descripcion: null, estado: 'published' }, 200, fixtureName + ': partial metadata');
      assert.equal(updated[1].version, 2);
      updated = await pair('PUT', route, {}, 200, fixtureName + ': empty PUT increments version');
      assert.equal(updated[1].version, 3);
      const design = { ...fixture.template_json, extension: { number: 123.4567, text: 'á 漢字', optional: null, nested: [false, 0, ''] } };
      updated = await pair('PUT', index => route(index) + '/design', { template_json: design }, 200, fixtureName + ': design');
      assert.equal(updated[1].version, 4);
      assert.deepEqual(updated[1].template_json, design);
      const duplicate = await pair('POST', index => route(index) + '/duplicate', {}, 201, fixtureName + ': duplicate', { creation: true });
      assert.equal(duplicate[1].nombre, 'Actualizado ñ 漢字 (copia)');
      assert.equal(duplicate[1].version, 1);
      assert.deepEqual(duplicate[1].template_json, design);
      for (const body of [{ template_json: null }, { nombre: null }, { company_id: missing }, { nombre: 'x'.repeat(201) }]) {
        const before = await snapshot();
        await pair('PUT', route, body, 500, fixtureName + ': failed update rolls back ' + Object.keys(body)[0]);
        assert.deepEqual(await snapshot(), before);
      }
      await pair('PUT', route, { nombre: '', descripcion: '', tags: [], autor: null, estado: null }, 200, fixtureName + ': clear nullable metadata');
      updated = await pair('PUT', route, { version: 0 }, 200, fixtureName + ': zero version resets to 2');
      assert.equal(updated[1].version, 2);
      const unchangedTimestamps = updated.map(row => row.updated_at);
      updated = await pair('PUT', route, { version: null }, 200, fixtureName + ': null version resets to 2');
      assert.equal(updated[1].version, 2);
      assert.deepEqual(updated.map(row => row.updated_at), unchangedTimestamps, 'TypeORM does not touch timestamps when the effective values are unchanged');
      await pair('PUT', index => route(index) + '/design', {}, 200, fixtureName + ': absent design is skipped and omitted from response', { omitDesign: true });
      for (const [suffix, method] of [['/design', 'PUT'], ['', 'DELETE'], ['/duplicate', 'POST'], ['', 'PUT']]) {
        for (const [id, status] of [[missing, 404], ['not-a-uuid', 500]]) {
          await pair(method, `/api/templates/${id}${suffix}`, {}, status, `${method} ${suffix}: missing or malformed id`);
        }
      }
      await pair('DELETE', route, undefined, 200, fixtureName + ': delete returns empty 200');
      for (let index = 0; index < 2; index++) {
        assert.equal((await db.query('SELECT id FROM report_templates WHERE id=$1', [pairIds[index]])).rowCount, 0);
        await request(index, 'GET', route(index), undefined, 404);
      }
    }
    for (const company of [undefined, null, '']) {
      const result = await pair('POST', '/api/templates', { nombre: '', descripcion: null, company_id: company, template_json: {} }, 201, 'create defaults ' + company, { creation: true });
      assert.equal(result[1].descripcion, '');
      assert.equal(result[1].company_id, 'c1000000-0000-0000-0000-000000000001');
    }
    for (const body of [{}, { nombre: 'Missing design' }, { template_json: {} }, { nombre: 'Null design', template_json: null },
      { nombre: 'Bad company', template_json: {}, company_id: missing }, { nombre: 'x'.repeat(201), template_json: {} }]) {
      const before = await snapshot();
      await pair('POST', '/api/templates', body, 500, 'invalid create body');
      assert.deepEqual(await snapshot(), before);
    }
    const long = await pair('POST', '/api/templates', { nombre: 'x'.repeat(200), template_json: {} }, 201, 'maximum name', { creation: true });
    const before = await snapshot();
    await pair('POST', index => `/api/templates/${long[index].id}/duplicate`, {}, 500, 'duplicate too long rolls back');
    assert.deepEqual(await snapshot(), before);
    const parents = await pair('POST', '/api/templates', { nombre: 'Parent', template_json: {} }, 201, 'parent', { creation: true });
    const children = await pair('POST', '/api/templates', { nombre: 'Child', template_json: {} }, 201, 'child', { creation: true });
    await db.query("UPDATE report_templates SET created_at='2026-01-01T00:00:00Z' WHERE id=ANY($1::uuid[])", [children.map(row => row.id)]);
    await pair('PUT', index => `/api/templates/${children[index].id}`, index => ({ based_on: parents[index].id, company_id: 'c1000000-0000-0000-0000-000000000002', autor: 'legacy', tags: ['ñ'] }), 200,
      'legacy assignment and based_on', { parents: parents.map(row => row.id) });
    const withReferences = await snapshot();
    await pair('DELETE', index => `/api/templates/${parents[index].id}`, undefined, 500, 'referenced parent cannot be deleted');
    assert.deepEqual(await snapshot(), withReferences);
    await writeFile(path.join(resultsDir, 'stage3.json'), JSON.stringify({ passed: true, comparisons: cases.length, cases,
      normalization: 'Only generated row IDs/timestamps and counterpart based_on IDs. Every write is compared with SQL and a GET from the same backend.' }, null, 2));
    console.log(`[stage3] ${cases.length} write comparisons passed, including persisted state and rollback.`);
  } finally {
    try {
      await db.query('UPDATE report_templates SET based_on=NULL WHERE id=ANY($1::uuid[])', [ids]);
      await db.query('DELETE FROM report_templates WHERE id=ANY($1::uuid[])', [ids]);
    } finally { await db.end(); }
  }
}
