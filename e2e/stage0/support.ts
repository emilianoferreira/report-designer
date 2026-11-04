import { test as base, expect, APIRequestContext, APIResponse } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const requireServer = createRequire(path.resolve(__dirname, '../../server/package.json'));
const { Client } = requireServer('pg');
const Ajv = requireServer('ajv');
const document = JSON.parse(readFileSync(path.resolve(__dirname, '../../contracts/openapi.json'), 'utf8'));
const ajv = new Ajv({ strict: false, allErrors: true });
ajv.addSchema(document, 'urn:report-designer:api');

export const COMPANY_1 = 'c1000000-0000-0000-0000-000000000001';
export const COMPANY_2 = 'c1000000-0000-0000-0000-000000000002';
export const MISSING = '00000000-0000-0000-0000-000000000000';
export const invoiceId = (number: number) => `f1000000-0000-0000-0000-${String(number).padStart(12, '0')}`;

export function fixture(name: string): any {
  return JSON.parse(readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf8'));
}

export const test = base.extend<{ api: APIRequestContext; otherApi: APIRequestContext; db: any }>({
  api: async ({ playwright }, use) => {
    const api = await playwright.request.newContext({ baseURL: process.env['STAGE0_API_URL'],
      storageState: process.env['STAGE8_STORAGE_STATE'],
      extraHTTPHeaders: process.env['STAGE8_CSRF'] ? { 'X-CSRF-Token': process.env['STAGE8_CSRF']! } : {} });
    try { await use(api); } finally { await api.dispose(); }
  },
  otherApi: async ({ playwright }, use) => {
    const state = JSON.parse(readFileSync(process.env['STAGE8_OTHER_STATE']!, 'utf8'));
    const api = await playwright.request.newContext({ baseURL: process.env['STAGE0_API_URL'], storageState: state.storageState,
      extraHTTPHeaders: { 'X-CSRF-Token': state.csrf } });
    try { await use(api); } finally { await api.dispose(); }
  },
  db: [async ({}, use: (client: any) => Promise<void>) => {
    const env = process.env;
    if (!/^(stage0|restorecheck)_[a-f0-9]{32}$/.test(env['DB_NAME'] || '') || env['DB_HOST'] !== '127.0.0.1' || !env['STAGE0_RUN_ID']) {
      throw new Error('Refusing tests without the isolated runner configuration.');
    }
    const client = new Client({
      host: env['DB_HOST'], port: Number(env['DB_PORT']), user: env['DB_USERNAME'],
      password: env['DB_PASSWORD'], database: env['DB_NAME'],
      ssl: env['STAGE0_CA_FILE'] ? { ca: readFileSync(env['STAGE0_CA_FILE'], 'utf8'), rejectUnauthorized: true } : undefined,
    });
    await client.connect();
    try {
      const marker = await client.query('SELECT run_id FROM stage0_test_guard');
      expect(marker.rows).toEqual([{ run_id: env['STAGE0_RUN_ID'] }]);
      await use(client);
    } finally { await client.end(); }
  }, { auto: true }],
});
export { expect };

function resolveRef(value: any): any {
  if (!value?.$ref) return value;
  return value.$ref.slice(2).split('/').reduce((current: any, key: string) => current[key], document);
}

export async function responseContract(response: APIResponse, route: string, method: string, status: number): Promise<any> {
  expect(response.status(), `${method.toUpperCase()} ${route}: ${await response.text()}`).toBe(status);
  const definition = resolveRef(document.paths[route][method].responses[String(status)]);
  expect(definition, `Missing documented response: ${method} ${route} ${status}`).toBeTruthy();
  if (!definition.content) {
    expect(await response.text()).toBe('');
    return undefined;
  }
  expect(response.headers()['content-type']).toMatch(/^application\/json\b/);
  const body = await response.json();
  const schema = definition.content['application/json'].schema;
  // Local references are resolved against the checked-in OpenAPI document.
  const validate = ajv.compile({ ...schema, ...(schema.$ref ? { $ref: `urn:report-designer:api${schema.$ref}` } : {}) ,
    ...(schema.items?.$ref ? { items: { $ref: `urn:report-designer:api${schema.items.$ref}` } } : {}) });
  expect(validate(body), JSON.stringify(validate.errors, null, 2)).toBe(true);
  return body;
}

export function stableJson(value: any): string {
  const sort = (input: any): any => Array.isArray(input) ? input.map(sort)
    : input && typeof input === 'object'
      ? Object.fromEntries(Object.keys(input).sort().map(key => [key, sort(input[key])]))
      : input;
  return JSON.stringify(sort(value), null, 2) + '\n';
}

export function normalizeTemplate(row: any): any {
  expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/);
  for (const key of ['created_at', 'updated_at']) {
    expect(row[key]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  }
  // Only server-generated row identity/timestamps vary. Nested document fields are untouched.
  return { ...row, id: '<generated-uuid>', created_at: '<generated-utc>', updated_at: '<generated-utc>' };
}

export async function createTemplate(api: APIRequestContext, name: string, suffix = ''): Promise<any> {
  const payload = fixture(name);
  payload.nombre += suffix;
  return responseContract(await api.post('/api/templates', { data: payload }), '/api/templates', 'post', 201);
}

export async function deleteTemplate(api: APIRequestContext, id: string): Promise<void> {
  await responseContract(await api.delete(`/api/templates/${id}`), '/api/templates/{id}', 'delete', 200);
}

export async function assertStored(db: any, api: APIRequestContext, id: string, expected: any) {
  const row = (await db.query('SELECT template_json FROM report_templates WHERE id = $1', [id])).rows[0];
  expect(row?.template_json).toEqual(expected);
  const read = await responseContract(await api.get(`/api/templates/${id}`), '/api/templates/{id}', 'get', 200);
  expect(read.template_json).toEqual(expected);
}
