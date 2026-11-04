import {
  test, expect, fixture, responseContract, stableJson, normalizeTemplate,
  createTemplate, deleteTemplate, assertStored, COMPANY_1, COMPANY_2, MISSING, invoiceId,
} from '../support';

for (const name of ['report-a4', 'report-ticket-80', 'price-label']) {
  test(`${name}: all template endpoints preserve the document and row contract`, async ({ api, db }) => {
    const created = await createTemplate(api, name);
    let duplicate: any;
    const evidence: any = { create: normalizeTemplate(created) };
    try {
      const initial = fixture(name).template_json;
      expect(created.template_json).toEqual(initial);
      expect(created.version).toBe(1);
      await assertStored(db, api, created.id, initial);
      const read = await responseContract(await api.get(`/api/templates/${created.id}`), '/api/templates/{id}', 'get', 200);
      evidence.get = normalizeTemplate(read);
      const changed = await responseContract(await api.put(`/api/templates/${created.id}`, {
        data: { nombre: `${created.nombre} actualizado`, descripcion: null, estado: 'published' },
      }), '/api/templates/{id}', 'put', 200);
      expect(changed.version).toBe(2);
      expect(changed.template_json).toEqual(initial);
      expect(changed.descripcion).toBeNull();
      expect(changed.created_at).toBe(created.created_at);
      expect(Date.parse(changed.updated_at)).toBeGreaterThanOrEqual(Date.parse(created.updated_at));
      evidence.update = normalizeTemplate(changed);

      const design = { ...initial, extensionAfterSave: { value: 123.4567, empty: '', optional: null, text: 'ñ 漢字' } };
      const saved = await responseContract(await api.put(`/api/templates/${created.id}/design`, {
        data: { template_json: design },
      }), '/api/templates/{id}/design', 'put', 200);
      expect(saved.version).toBe(3);
      await assertStored(db, api, created.id, design);
      evidence.design = normalizeTemplate(saved);

      duplicate = await responseContract(await api.post(`/api/templates/${created.id}/duplicate`, { data: {} }), '/api/templates/{id}/duplicate', 'post', 201);
      expect(duplicate.id).not.toBe(created.id);
      expect(duplicate.nombre).toBe(`${saved.nombre} (copia)`);
      expect(duplicate.version).toBe(1);
      expect(duplicate.template_json).toEqual(design);
      await assertStored(db, api, duplicate.id, design);
      evidence.duplicate = normalizeTemplate(duplicate);

      const listed = await responseContract(await api.get('/api/templates'), '/api/templates', 'get', 200);
      expect(listed.map((row: any) => row.id)).toContain(created.id);
      expect(listed.map((row: any) => row.id)).toContain(duplicate.id);
      expect(listed.find((row: any) => row.id === created.id).template_json).toEqual(design);
      expect(stableJson(evidence)).toMatchSnapshot(`${name}-lifecycle.json`);
    } finally {
      if (duplicate) await deleteTemplate(api, duplicate.id);
      await deleteTemplate(api, created.id);
    }
    expect((await db.query('SELECT id FROM report_templates WHERE id = $1', [created.id])).rowCount).toBe(0);
    await responseContract(await api.get(`/api/templates/${created.id}`), '/api/templates/{id}', 'get', 404);
  });
}

test('template defaults, omitted fields, null, empty strings and open JSON', async ({ api, db }) => {
  const created = await responseContract(await api.post('/api/templates', {
    data: { nombre: 'Defaults', descripcion: null, template_json: { future: true } },
  }), '/api/templates', 'post', 201);
  try {
    expect(created.company_id).toBe(COMPANY_1);
    expect(created.descripcion).toBe('');
    expect(created.estado).toBe('draft');
    expect(created.tags).toEqual([]);
    expect(created.autor).toBeNull();
    expect(created.based_on).toBeNull();
    const empty = await responseContract(await api.put(`/api/templates/${created.id}`, { data: {} }), '/api/templates/{id}', 'put', 200);
    expect(empty.version).toBe(2);
    expect(empty.nombre).toBe(created.nombre);
    const cleared = await responseContract(await api.put(`/api/templates/${created.id}`, {
      data: { nombre: '', descripcion: '' },
    }), '/api/templates/{id}', 'put', 200);
    expect(cleared.nombre).toBe('');
    expect(cleared.descripcion).toBe('');
    await assertStored(db, api, created.id, { future: true });
  } finally { await deleteTemplate(api, created.id); }
});

test('template lists filter by company, default company and updated_at DESC', async ({ api, otherApi, db }) => {
  const first = await createTemplate(api, 'report-a4', ' first');
  const second = await createTemplate(api, 'price-label', ' second');
  const other = await responseContract(await otherApi.post('/api/templates', {
    data: { ...fixture('report-a4'), nombre: 'Empresa 2', company_id: COMPANY_2 },
  }), '/api/templates', 'post', 201);
  try {
    // Distinct, deterministic timestamps avoid depending on clock precision or tie ordering.
    await db.query("UPDATE report_templates SET updated_at = '2026-01-01T00:00:00Z' WHERE id = $1", [first.id]);
    await db.query("UPDATE report_templates SET updated_at = '2026-01-02T00:00:00Z' WHERE id = $1", [second.id]);
    const rows = await responseContract(await api.get(`/api/templates?companyId=${COMPANY_1}`), '/api/templates', 'get', 200);
    expect(rows.map((row: any) => row.id)).toEqual([second.id, first.id]);
    expect(await (await api.get('/api/templates')).json()).toEqual(rows);
    const otherRows = await responseContract(await otherApi.get(`/api/templates?companyId=${COMPANY_2}`), '/api/templates', 'get', 200);
    expect(otherRows.map((row: any) => row.id)).toEqual([other.id]);
    expect((await api.get(`/api/templates?companyId=${MISSING}`)).status()).toBe(403);
  } finally {
    for (const row of [first, second]) await deleteTemplate(api, row.id);
    await deleteTemplate(otherApi, other.id);
  }
});

for (const company of [COMPANY_1, COMPANY_2]) {
  test(`invoice summaries: exact shape, decimal strings and ordering for ${company}`, async ({ api, otherApi }) => {
    const client = company === COMPANY_1 ? api : otherApi;
    const data = await responseContract(await client.get(`/api/invoices?companyId=${company}`), '/api/invoices', 'get', 200);
    expect(data.length).toBe(company === COMPANY_1 ? 4 : 1);
    expect(stableJson(data)).toMatchSnapshot(`invoices-${company}.json`);
    if (company === COMPANY_1) expect(await (await api.get('/api/invoices')).json()).toEqual(data);
    expect((await client.get(`/api/invoices?companyId=${MISSING}`)).status()).toBe(403);
  });
}

for (const number of [1, 2, 3, 4, 5]) {
  test(`invoice ${number}: complete render data contract`, async ({ api, otherApi, db }) => {
    const id = invoiceId(number);
    const data = await responseContract(await (number === 4 ? otherApi : api).get(`/api/invoices/${id}/data`), '/api/invoices/{id}/data', 'get', 200);
    const sql = (await db.query('SELECT build_invoice_data($1) AS data', [id])).rows[0].data;
    expect(data).toEqual(sql);
    expect(data.invoiceLines).toEqual(data.Articulos);
    expect(typeof data.Total).toBe('number');
    expect(typeof data.invoice.Numero.Numero).toBe('string');
    expect(stableJson(data)).toMatchSnapshot(`invoice-${number}-data.json`);
  });
}

test('invoice without lines, taxes, contact or branch retains empty arrays and defaults', async ({ api, db }) => {
  const id = 'f2000000-0000-4000-8000-000000000001';
  await db.query(`INSERT INTO invoices (id, company_id, type_id, currency_id, numero, fecha)
    SELECT $1, company_id, type_id, currency_id, 9999, '2026-01-01T12:00:00Z' FROM invoices WHERE id = $2`, [id, invoiceId(1)]);
  try {
    const data = await responseContract(await api.get(`/api/invoices/${id}/data`), '/api/invoices/{id}/data', 'get', 200);
    expect(data.invoiceLines).toEqual([]);
    expect(data.Impuestos).toEqual([]);
    expect(data.hasContacto).toBe(false);
    expect(data.Contacto.GuardarComo).toBe('');
    expect(data.invoice.Sucursal.Direccion).toBe('');
    expect(stableJson(data)).toMatchSnapshot('invoice-empty-data.json');
  } finally { await db.query('DELETE FROM invoices WHERE id = $1', [id]); }
});

const missingRoutes = [
  ['get', '/api/templates/{id}'], ['put', '/api/templates/{id}'], ['delete', '/api/templates/{id}'],
  ['put', '/api/templates/{id}/design'], ['post', '/api/templates/{id}/duplicate'], ['get', '/api/invoices/{id}/data'],
] as const;
for (const [method, route] of missingRoutes) {
  test(`${method} ${route}: missing UUID and malformed UUID errors`, async ({ api }) => {
    for (const [id, status] of [[MISSING, 404], ['not-a-uuid', 500]] as const) {
      const response = await api.fetch(route.replace('{id}', id), { method: method.toUpperCase(), ...(method === 'put' ? { data: {} } : {}) });
      const body = await responseContract(response, route, method, status);
      expect(body).toEqual(status === 500
        ? { statusCode: 500, message: 'Internal server error' }
        : { statusCode: 404, error: 'Not Found', message: route.startsWith('/api/invoices') ? 'Invoice not found' : `Template ${id} not found` });
    }
  });
}

test('unauthorized company inputs return 403; invalid document bodies retain generic 500', async ({ api }) => {
  for (const route of ['/api/templates', '/api/invoices']) {
    expect((await api.get(`${route}?companyId=invalid`)).status()).toBe(403);
    expect((await api.get(`${route}?companyId=`)).status()).toBe(403);
  }
  for (const data of [{}, { nombre: 'Missing design' }, { template_json: {} }, { nombre: 'x'.repeat(201), template_json: {} }]) {
    await responseContract(await api.post('/api/templates', { data }), '/api/templates', 'post', 500);
  }
  expect((await api.post('/api/templates',{data:{nombre:'Unknown company',company_id:MISSING,template_json:{}}})).status()).toBe(403);
});

test('ownership is immutable and a foreign session cannot read a template', async ({ api, otherApi }) => {
  const created = await createTemplate(api, 'report-a4');
  try {
    const denied = await api.put(`/api/templates/${created.id}`, {
      data: { company_id: COMPANY_2, autor: 'contract-characterization', tags: ['legacy'] },
    });
    expect(denied.status()).toBe(403);
    const read = await responseContract(await api.get(`/api/templates/${created.id}?companyId=${COMPANY_1}`), '/api/templates/{id}', 'get', 200);
    expect(read.company_id).toBe(COMPANY_1);
    await responseContract(await otherApi.get(`/api/templates/${created.id}`),'/api/templates/{id}','get',404);
  } finally { await deleteTemplate(api, created.id); }
});
