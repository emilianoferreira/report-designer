import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function checkProduction({ dotnetUrl, nestjsUrl, unavailableUrl, resultsDir }) {
  const checks = [];
  const fetchLocal = (base, route, options) => fetch(base + route, { ...options, signal: AbortSignal.timeout(10_000) });
  for (const [name, base] of [['dotnet', dotnetUrl], ['nestjs', nestjsUrl]]) {
    const index = await fetchLocal(base, '/');
    assert.equal(index.status, 200);
    const html = await index.text();
    assert.match(html, /<app-root/);
    assert.match(index.headers.get('cache-control'), /no-store/);
    for (const route of ['/templates', '/designer/saved-template', '/price-labels']) {
      const response = await fetchLocal(base, route);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), html, 'SPA deep links must serve the production index');
    }
    const asset = html.match(/src="([^\"]+\.js)"/)[1];
    const javascript = await fetchLocal(base, '/' + asset);
    assert.equal(javascript.status, 200);
    assert.match(javascript.headers.get('cache-control'), /immutable/);
    assert.match(javascript.headers.get('content-type'), /javascript/);
    assert.equal((await fetchLocal(base, '/missing-production-chunk.js')).status, 404);
    assert.equal((await fetchLocal(base, '/health/live')).status, 200);
    assert.equal((await fetchLocal(base, '/health/ready')).status, 200);
    checks.push(`${name}: static build, SPA routes, immutable chunks, no-store index, health`);
  }
  let id;
  try {
    const design = { type: 'price-label', embeddedImage: 'x'.repeat(1024 * 1024), unicode: 'ñ 漢字' };
    const created = await fetchLocal(dotnetUrl, '/api/templates', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre: 'Production payload limit', template_json: design }) });
    assert.equal(created.status, 201);
    id = (await created.json()).id;
    const saved = await fetchLocal(nestjsUrl, `/api/templates/${id}/design`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ template_json: design }) });
    assert.equal(saved.status, 200, 'rollback must accept embedded-image-sized documents');
    const loaded = await (await fetchLocal(dotnetUrl, `/api/templates/${id}`)).json();
    assert.equal(loaded.version, 2);
    assert.deepEqual(loaded.template_json, design);
    checks.push('1 MiB document persists through production proxy and .NET → NestJS → .NET');
  } finally {
    if (id) assert.equal((await fetchLocal(dotnetUrl, `/api/templates/${id}`, { method: 'DELETE' })).status, 200);
  }
  assert.equal((await fetchLocal(unavailableUrl, '/')).status, 200);
  assert.equal((await fetchLocal(unavailableUrl, '/health/live')).status, 200);
  assert.equal((await fetchLocal(unavailableUrl, '/health/ready')).status, 502);
  assert.equal((await fetchLocal(unavailableUrl, '/api/templates')).status, 502);
  checks.push('unavailable API stays 502; no SPA success or automatic backend retry');
  await writeFile(path.join(resultsDir, 'stage6.json'), JSON.stringify({ passed: true, checks,
    scope: 'Published .NET Production, compiled NestJS production, optimized Angular and native Nginx. No containers or remote deployment.' }, null, 2));
  console.log(`[stage6] ${checks.length} production artifact/proxy checks passed.`);
}
