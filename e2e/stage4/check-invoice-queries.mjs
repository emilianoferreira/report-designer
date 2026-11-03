import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function checkInvoiceQueries({ root, env, baseUrl, resultsDir }) {
  const requireServer = createRequire(path.join(root, 'server/package.json'));
  const { Client } = requireServer('pg');
  const Ajv = requireServer('ajv');
  const contract = JSON.parse(await readFile(path.join(root, 'contracts/openapi.json'), 'utf8'));
  const ajv = new Ajv({ strict: false, allErrors: true });
  ajv.addSchema(contract, 'urn:report-designer:stage4');
  const validators = {
    list: ajv.compile({ type: 'array', items: { $ref: 'urn:report-designer:stage4#/components/schemas/InvoiceSummary' } }),
    data: ajv.compile({ $ref: 'urn:report-designer:stage4#/components/schemas/InvoiceData' }),
    404: ajv.compile({ $ref: 'urn:report-designer:stage4#/components/schemas/NotFoundError' }),
    500: ajv.compile({ $ref: 'urn:report-designer:stage4#/components/schemas/ServerError' }),
  };
  assert.match(env.DB_NAME, /^stage0_[a-f0-9]{32}$/);
  assert.equal(env.DB_HOST, '127.0.0.1');
  const db = new Client({ host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USERNAME, password: env.DB_PASSWORD, database: env.DB_NAME });
  const company1 = 'c1000000-0000-0000-0000-000000000001';
  const company2 = 'c1000000-0000-0000-0000-000000000002';
  const missing = '00000000-0000-0000-0000-000000000000';
  const seedId = n => `f1000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const customId = 'f4000000-0000-4000-8000-000000000001';
  const typeId = 'a4000000-0000-4000-8000-000000000001';
  const cases = [];
  await db.connect();
  async function json(url, status) {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const text = await response.text();
    assert.equal(response.status, status, `${url}: ${text}`);
    assert.match(response.headers.get('content-type'), /^application\/json\b/);
    return JSON.parse(text);
  }
  async function parity(route, status, name) {
    const legacy = await json(env.STAGE0_API_URL + route, status);
    const current = await json(baseUrl + route, status);
    const validate = validators[status === 200 ? (Array.isArray(current) ? 'list' : 'data') : status];
    assert.ok(validate(current), JSON.stringify(validate.errors));
    assert.deepEqual(current, legacy, name);
    if (status === 200 && route.includes('/data')) {
      const id = decodeURIComponent(route.split('/')[3]);
      const sql = (await db.query('SELECT build_invoice_data($1) AS data', [id])).rows[0].data;
      assert.deepEqual(current, sql, 'renderer JSON must match the unchanged SQL function');
      assert.deepEqual(current.invoiceLines, current.Articulos);
    }
    cases.push({ name, status });
    return current;
  }
  async function snapshot() {
    const result = {};
    // Constant identifiers only. These tables include all inputs to the list and SQL function.
    for (const table of ['companies', 'branches', 'contacts', 'currencies', 'invoice_types', 'invoices', 'invoice_lines', 'invoice_taxes'])
      result[table] = (await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`)).rows;
    return result;
  }
  try {
    assert.deepEqual((await db.query('SELECT run_id FROM stage0_test_guard')).rows, [{ run_id: env.STAGE0_RUN_ID }]);
    const before = await snapshot();
    const defaultRows = await parity('/api/invoices', 200, 'default company and fecha DESC');
    assert.equal(defaultRows.length, 4);
    assert.equal(defaultRows.find(row => row.id === seedId(1)).contact, null);
    assert.ok(defaultRows.every(row => typeof row.total === 'string'));
    await parity(`/api/invoices?companyId=${company1}`, 200, 'explicit company');
    assert.equal((await parity(`/api/invoices?companyId=${company2}`, 200, 'second company')).length, 1);
    await parity(`/api/invoices?companyId=${company1.toUpperCase()}`, 200, 'uppercase company UUID');
    await parity(`/api/invoices?companyId=${company1.replaceAll('-', '')}`, 200, 'compact company UUID');
    assert.deepEqual(await parity(`/api/invoices?companyId=${missing}`, 200, 'unknown company'), []);
    for (let n = 1; n <= 5; n++) {
      const data = await parity(`/api/invoices/${seedId(n)}/data`, 200, `seed invoice ${n}`);
      assert.equal(typeof data.Total, 'number');
      assert.equal(typeof data.invoice.Numero.Numero, 'string');
    }
    await parity(`/api/invoices/${seedId(1).toUpperCase()}/data`, 200, 'uppercase invoice UUID');
    await parity(`/api/invoices/${seedId(1).replaceAll('-', '')}/data`, 200, 'compact invoice UUID');
    await parity(`/api/invoices/${seedId(4)}/data?companyId=${company1}`, 200, 'legacy individual lookup ignores company parameter');
    assert.deepEqual(await parity(`/api/invoices/${missing}/data`, 404, 'missing invoice'), { statusCode: 404, error: 'Not Found', message: 'Invoice not found' });
    await parity(`/api/invoices/${missing.replaceAll('-', '')}/data`, 404, 'missing compact UUID');
    for (const value of ['', '  ', 'invalid', "x' OR 1=1 --"])
      await parity(`/api/invoices?companyId=${encodeURIComponent(value)}`, 500, 'invalid company ' + value);
    for (const value of ['  ', 'not-a-uuid', "x' OR 1=1 --"])
      await parity(`/api/invoices/${encodeURIComponent(value)}/data`, 500, 'invalid invoice ' + value);
    assert.deepEqual(await snapshot(), before, 'seed reads must not mutate any invoice input');

    await db.query(`INSERT INTO invoice_types (id, company_id, nombre, codigo, es_cfe, opera_contado)
      VALUES ($1,$2,'Tipo ñ 漢字',NULL,NULL,NULL)`, [typeId, company1]);
    await db.query(`INSERT INTO invoices (id, company_id, type_id, currency_id, numero, fecha, serie, total, subtotal,
      redondeo, monto_dto_global, is_consumo_final, is_imp_incluidos, porcentaje_desc_global, estado)
      SELECT $1, company_id, $2, currency_id, 9001, '2026-04-01T03:04:05.123987+03', NULL, NULL, NULL,
      NULL, NULL, NULL, NULL, NULL, NULL FROM invoices WHERE id=$3`, [customId, typeId, seedId(1)]);
    const emptyBefore = await snapshot();
    const empty = await parity(`/api/invoices/${customId}/data`, 200, 'empty invoice with nullable amounts and flags');
    assert.deepEqual(empty.invoiceLines, []);
    assert.deepEqual(empty.Impuestos, []);
    assert.equal(empty.hasContacto, false);
    assert.equal(empty.Contacto.GuardarComo, '');
    assert.equal(empty.invoice.Sucursal.Direccion, '');
    assert.equal(empty.Total, null);
    assert.equal(empty.hasRedondeo, null);
    const summaries = await parity('/api/invoices', 200, 'nullable summary and fractional timestamp');
    assert.equal(summaries[0].id, customId);
    assert.equal(summaries[0].total, null);
    assert.equal(summaries[0].fecha, '2026-04-01T00:04:05.123Z');
    assert.equal(summaries[0].invoice_type.codigo, null);
    assert.deepEqual(await snapshot(), emptyBefore);

    await db.query(`UPDATE invoices SET total=1234567890123.40, subtotal=-0.10, tipo_cambio=2.1234,
      redondeo=-0.01, comentario='Texto ñ 漢字', cae_fecha_vto='2028-02-29', cfe_adenda='Adenda',
      porcentaje_desc_global=5.25, monto_dto_global=1.50 WHERE id=$1`, [customId]);
    // Insert out of order to verify the SQL function's linea_nro ordering.
    await db.query(`INSERT INTO invoice_lines (invoice_id, linea_nro, articulo_codigo, articulo_nombre, cantidad, precio_unitario)
      VALUES ($1,20,'SECOND','Segundo',0.0001,1.20), ($1,5,'FIRST',NULL,2.1234,4.50)`, [customId]);
    await db.query(`INSERT INTO invoice_taxes (invoice_id, nombre, valor) VALUES ($1,'IVA ñ',1.23)`, [customId]);
    const editedBefore = await snapshot();
    const edited = await parity(`/api/invoices/${customId}/data`, 200, 'fresh data, decimal precision, line ordering and leap date');
    assert.equal(edited.invoice.Fecha, '2026-04-01T00:04:05.123987+00:00');
    assert.equal(edited.invoice.Numero.CAEFechaVto, '2028-02-29');
    assert.deepEqual(edited.invoiceLines.map(line => line.Articulo.Codigo), ['FIRST', 'SECOND']);
    assert.equal(edited.invoiceLines[0].Cantidad, 2.1234);
    assert.equal(edited.hasDtoGlobal, true);
    assert.equal(edited.hasRedondeo, true);
    assert.equal((await parity('/api/invoices', 200, 'numeric summary stays a decimal string'))[0].total, '1234567890123.40');
    assert.deepEqual(await snapshot(), editedBefore);
    await db.query('DELETE FROM invoices WHERE id=$1', [customId]);
    await parity(`/api/invoices/${customId}/data`, 404, 'deleted invoice is not cached');
    assert.deepEqual(await parity('/api/invoices', 200, 'list after delete'), defaultRows);
    await writeFile(path.join(resultsDir, 'stage4.json'), JSON.stringify({ passed: true, comparisons: cases.length, cases,
      normalization: 'None: complete JSON, array ordering, dates, types and identifiers compared directly.' }, null, 2));
    console.log(`[stage4] ${cases.length} direct invoice comparisons passed, including SQL function and read-only state checks.`);
  } finally {
    try {
      await db.query('DELETE FROM invoices WHERE id=$1', [customId]);
      await db.query('DELETE FROM invoice_types WHERE id=$1', [typeId]);
    } finally { await db.end(); }
  }
}
