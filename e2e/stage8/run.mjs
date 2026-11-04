import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSecurity, seedIdentities, login, call } from './check-security.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const requireServer = createRequire(path.join(root, 'server/package.json'));
const { Client } = requireServer('pg');
if (process.argv.length > 2) throw new Error('This suite accepts no arguments. Original snapshots are frozen; recording is disabled.');
const runId = randomUUID();
const project = 'stage8-' + runId.replaceAll('-', '').slice(0, 16);
const database = 'stage0_' + runId.replaceAll('-', '');
const resultsDir = path.join(root, 'e2e/test-results', project);
const sandbox = await mkdtemp(path.join(os.tmpdir(), 'report-designer-stage8-'));
const secrets = path.join(sandbox, 'secrets');
const password = randomBytes(24).toString('hex');
const adminPassword = randomBytes(24).toString('hex');
const docker = process.env.DOCKER_BIN || 'docker';
const children = new Set();
const streams = [];
let stackCreated = false;
let cleanupPromise;
let commandSequence = 0;
await mkdir(resultsDir, { recursive: true });
await mkdir(secrets, { recursive: true });

function execute(name, binary, args, { env = process.env, input, capture = false } = {}) {
  const output = createWriteStream(path.join(resultsDir, `${++commandSequence}-${name}.log`));
  streams.push(output);
  const child = spawn(binary, args, { cwd: root, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  children.add(child);
  let text = '';
  child.stdout.on('data', value => { output.write(value); if (capture) text += value; });
  child.stderr.on('data', value => output.write(value));
  if (input !== undefined) child.stdin.end(input); else child.stdin.end();
  return new Promise((resolve, reject) => {
    child.once('error', error => { children.delete(child); reject(error); });
    child.once('close', code => {
      children.delete(child);
      if (code === 0) resolve(text.trim());
      else reject(new Error(`${name} failed (${code}); see ${resultsDir}`));
    });
  });
}
async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}
const [dbPort, dotnetPort, nestjsPort, webPort] = await Promise.all([freePort(), freePort(), freePort(), freePort()]);
assert.equal(new Set([dbPort, dotnetPort, nestjsPort, webPort]).size, 4);
const override = path.join(sandbox, 'isolated.json');
const publicEnv = path.join(sandbox, 'public.env');
const composeEnv = { ...process.env, RELEASE_TAG: project, IMAGE_PREFIX: project, PUBLIC_HOST: 'localhost',
  HTTP_BIND: '127.0.0.1', HTTP_PORT: String(webPort), API_UPSTREAM: 'api-dotnet:8080',
  DB_HOST: 'pg-test', DB_PORT: '5432', DB_NAME: database, DB_USERNAME: 'stage0_app', SECRETS_DIR: secrets, COMPOSE_PROFILES: '', AUTH_SECURE_COOKIE: 'false' };
const composeArgs = ['compose', '--project-name', project, '--env-file', publicEnv,
  '-f', path.join(root, 'deployment/compose.yaml'), '-f', override];
const compose = (name, args, options = {}) => execute(name, docker, [...composeArgs, ...args], { env: composeEnv, ...options });
const webUrl = `http://127.0.0.1:${webPort}`;
const dotnetUrl = `http://127.0.0.1:${dotnetPort}`;
const nestjsUrl = `http://127.0.0.1:${nestjsPort}`;
let ca; let users; let currentIdentity; let securityChecks;
const env = { ...process.env, DB_HOST: '127.0.0.1', DB_PORT: String(dbPort), DB_NAME: database,
  DB_USERNAME: 'stage0_app', DB_PASSWORD: password, STAGE0_CA_FILE: path.join(secrets, 'pg-ca.pem'),
  STAGE0_RUN_ID: runId, STAGE0_API_URL: nestjsUrl, STAGE0_UI_URL: webUrl, STAGE0_RECORD: '0' };
const client = user => new Client({ host: '127.0.0.1', port: dbPort, database,
  user, password: user === 'stage8_admin' ? adminPassword : password, ssl: { ca, rejectUnauthorized: true } });

async function ready() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(webUrl + '/health/ready', { signal: AbortSignal.timeout(3000) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Packaged web/API not ready');
}
async function switchBackend(upstream) {
  assert.ok(['api-dotnet:8080', 'api-nestjs:3000'].includes(upstream));
  composeEnv.API_UPSTREAM = upstream;
  await compose('switch-web', ['up', '-d', '--no-build', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '120', 'web']);
  await ready();
  // The same authenticated cookie must survive proxy replacement.
  if (currentIdentity) {
    const session = await call(webUrl,currentIdentity,'GET','/api/auth/session');
    assert.equal(session.company_id,currentIdentity.session.company_id);
    const marker='stage8-'+randomUUID();
    await call(webUrl,currentIdentity,'GET','/api/templates/'+marker,undefined,500);
    const selected=await compose('selected-log',['logs','--no-color',upstream.split(':')[0]],{capture:true});
    const other=await compose('other-log',['logs','--no-color',upstream.startsWith('api-dotnet')?'api-nestjs':'api-dotnet'],{capture:true});
    assert.ok(selected.includes(marker),'The selected backend must receive the authenticated request');
    assert.ok(!other.includes(marker),'The proxy must not retry against the other backend');
  }
}
async function baseline(backend) {
  const directory=path.join(resultsDir,backend);
  await mkdir(directory,{recursive:true});
  const stateFile=path.join(secrets,backend+'-state.json');
  const state={cookies:[{name:'rd_session',value:currentIdentity.cookie.split('=')[1],domain:'127.0.0.1',path:'/',expires:-1,httpOnly:true,secure:false,sameSite:'Strict'}],origins:[]};
  await writeFile(stateFile,JSON.stringify(state),{mode:0o600});
  const credentials=path.join(secrets,'test-users.json');
  const other=await login(webUrl,users.bob);
  const otherState=path.join(secrets,backend+'-other.json');
  await writeFile(otherState,JSON.stringify({csrf:other.session.csrf_token,storageState:{cookies:[{...state.cookies[0],value:other.cookie.split('=')[1]}],origins:[]}}),{mode:0o600});
  await writeFile(credentials,JSON.stringify(users),{mode:0o600});
  console.log('[stage8] Authenticated editor snapshots and browser security: '+backend);
  await execute('playwright-'+backend,process.execPath,[path.join(root,'node_modules/@playwright/test/cli.js'),'test','--config','e2e/playwright.stage8.config.ts'],{
    env:{...env,STAGE0_API_URL:webUrl,STAGE0_RESULTS_DIR:directory,STAGE8_STORAGE_STATE:stateFile,STAGE8_CSRF:currentIdentity.session.csrf_token,STAGE8_TEST_USERS:credentials,STAGE8_OTHER_STATE:otherState}
  });
}
async function request(method,route,data,status=200) { return call(webUrl,currentIdentity,method,route,data,status); }
async function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    for (const child of children) child.kill('SIGTERM');
    if (stackCreated) {
      await compose('final-status', ['ps', '--all', '--format', 'json']).catch(() => {});
      await compose('container-logs', ['logs', '--no-color']).catch(() => {});
      // Only this randomly named project; never prune shared Docker resources.
      assert.match(project, /^stage8-[0-9a-f]{16}$/);
      await compose('isolated-cleanup', ['down', '--volumes', '--remove-orphans', '--timeout', '10']);
      const remaining = await execute('remaining-containers', docker, ['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`], { capture: true });
      assert.equal(remaining, '', 'isolated containers must be removed');
      const volumes = await execute('remaining-volumes', docker, ['volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${project}`], { capture: true });
      assert.equal(volumes, '', 'isolated database volume must be removed');
    }
    const target = await realpath(sandbox);
    assert.equal(path.dirname(target), await realpath(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('report-designer-stage8-'));
    await rm(target, { recursive: true });
    for (const stream of streams) stream.end();
  })();
  return cleanupPromise;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  cleanup().then(() => process.exit(130)).catch(error => { console.error(error); process.exit(1); });
});

try {
  console.log(`[stage8] Project ${project}; artifacts ${resultsDir}`);
  const endpoint = process.env.DOCKER_HOST || await execute('docker-context', docker,
    ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { capture: true });
  assert.ok(endpoint.startsWith('unix://') || endpoint.startsWith('npipe://'), 'Only a local Docker daemon is allowed');
  const version = await execute('docker-version', docker, ['version', '--format', '{{.Server.Version}}'], { capture: true });
  const existing = await execute('project-collision', docker, ['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`], { capture: true });
  assert.equal(existing, '');
  assert.equal(await execute('volume-collision', docker, ['volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${project}`], { capture: true }), '');
  await writeFile(publicEnv, '# All isolated settings are explicit in the runner environment.\n');
  await writeFile(override, JSON.stringify({ services: {
    'pg-test': { image: 'postgres:16-bookworm', environment: { POSTGRES_USER: 'stage8_admin', POSTGRES_DB: database, POSTGRES_PASSWORD_FILE: '/run/secrets/PG_ADMIN_PASSWORD' },
      ports: [`127.0.0.1:${dbPort}:5432`], volumes: ['test_pgdata:/var/lib/postgresql/data', `${secrets}/server.crt:/run/tls/server.crt:ro`, `${secrets}/server.key:/run/tls/server.key:ro`],
      secrets: [{ source: 'pg_admin_password', target: 'PG_ADMIN_PASSWORD' }],
      command: ['postgres', '-c', 'ssl=on', '-c', 'ssl_cert_file=/run/tls/server.crt', '-c', 'ssl_key_file=/run/tls/server.key', '-c', 'timezone=UTC'],
      // initdb briefly starts a socket-only server; wait for the final TCP/TLS server.
      healthcheck: { test: ['CMD-SHELL', `pg_isready -h 127.0.0.1 -U stage8_admin -d ${database}`], interval: '2s', timeout: '3s', retries: 30 } },
    'api-dotnet': { ports: [`127.0.0.1:${dotnetPort}:8080`], depends_on: { 'pg-test': { condition: 'service_healthy' } } },
    'api-nestjs': { ports: [`127.0.0.1:${nestjsPort}:3000`], depends_on: { 'pg-test': { condition: 'service_healthy' } } },
    'nestjs-tests': { image:`${project}/nestjs-tests:${project}`,profiles:['test-tools'],
      build:{context:root,dockerfile:'deployment/api-nestjs.Dockerfile',target:'build'} },
  }, volumes: { test_pgdata: {} }, secrets: { pg_admin_password: { file: path.join(secrets, 'PG_ADMIN_PASSWORD') } } }, null, 2));
  await writeFile(path.join(secrets, 'DB_PASSWORD'), password, { mode: 0o644 });
  await writeFile(path.join(secrets, 'PG_ADMIN_PASSWORD'), adminPassword, { mode: 0o644 });
  await writeFile(path.join(secrets, 'ConnectionStrings__Postgres'),
    `Host=pg-test;Port=5432;Database=${database};Username=stage0_app;Password=${password};SSL Mode=VerifyFull;Root Certificate=/run/secrets/pg-ca.pem;Timeout=5;Command Timeout=30`, { mode: 0o644 });
  await execute('create-ca', 'openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(secrets, 'ca.key'),
    '-out', path.join(secrets, 'pg-ca.pem'), '-subj', '/CN=stage8-isolated-ca', '-days', '2']);
  await execute('create-server-key', 'openssl', ['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(secrets, 'server.key'),
    '-out', path.join(secrets, 'server.csr'), '-subj', '/CN=pg-test']);
  await writeFile(path.join(secrets, 'tls.ext'), 'subjectAltName=DNS:pg-test,DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n');
  await execute('sign-server', 'openssl', ['x509', '-req', '-in', path.join(secrets, 'server.csr'), '-CA', path.join(secrets, 'pg-ca.pem'),
    '-CAkey', path.join(secrets, 'ca.key'), '-CAcreateserial', '-out', path.join(secrets, 'server.crt'), '-days', '2', '-extfile', path.join(secrets, 'tls.ext')]);
  ca = await readFile(env.STAGE0_CA_FILE, 'utf8');
  console.log('[stage8] Building all three production Dockerfiles.');
  await compose('compose-config', ['config', '--quiet']);
  await compose('image-builds', ['build']);
  await execute('postgres-pull', docker, ['pull', 'postgres:16-bookworm']);
  await execute('postgres-key-permissions', docker, ['run', '--rm', '--label', `stage8.owner=${project}`,
    '--mount', `type=bind,src=${secrets},dst=/tls`, '--entrypoint', 'sh', 'postgres:16-bookworm', '-c', 'chown 999:999 /tls/server.key && chmod 600 /tls/server.key']);
  stackCreated = true;
  await compose('isolated-postgres', ['up', '-d', '--wait', '--wait-timeout', '120', 'pg-test']);
  const admin = client('stage8_admin');
  await admin.connect();
  try {
    assert.equal((await admin.query('SELECT current_database() AS name')).rows[0].name, database);
    for (const file of ['001-schema.sql', '002-seed.sql', '003-view-invoice-data.sql', '004-auth.sql']) await admin.query(await readFile(path.join(root, 'database', file), 'utf8'));
    users=await seedIdentities(admin);
    await admin.query('CREATE TABLE stage0_test_guard (run_id text PRIMARY KEY)');
    await admin.query('INSERT INTO stage0_test_guard VALUES ($1)', [runId]);
    await admin.query(`CREATE ROLE stage0_app LOGIN PASSWORD '${password}'`);
    await admin.query('GRANT USAGE ON SCHEMA public TO stage0_app');
    await admin.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO stage0_app');
    await admin.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO stage0_app');
  } finally { await admin.end(); }
  console.log('[stage8] Starting the production images on isolated TLS PostgreSQL.');
  await compose('production-images-start', ['up', '-d', '--no-build', '--wait', '--wait-timeout', '180']);
  await ready();
  const index = await fetch(webUrl + '/templates');
  assert.equal(index.status, 200);
  assert.match(index.headers.get('cache-control'), /no-store/);
  const html = await index.text();
  const chunk = html.match(/src="([^\"]+\.js)"/)[1];
  const asset = await fetch(webUrl + '/' + chunk);
  assert.match(asset.headers.get('cache-control'), /immutable/);
  assert.equal((await fetch(webUrl + '/missing-docker-chunk.js')).status, 404);
  assert.equal((await fetch(dotnetUrl + '/reference/openapi.json')).status, 404);
  const state = JSON.parse(await compose('state', ['ps', '--all', '--format', 'json'], { capture: true }).then(text => text.trim().startsWith('[') ? text : '[' + text.split('\n').filter(Boolean).join(',') + ']'));
  assert.ok(state.every(service => service.State === 'running' && service.Health === 'healthy'));
  for (const service of ['web', 'api-dotnet', 'api-nestjs']) {
    const uid = await compose(`uid-${service}`, ['exec', '-T', service, 'id', '-u'], { capture: true });
    assert.notEqual(uid, '0');
    if (service !== 'web') {
      const container = await compose(`container-${service}`, ['ps', '-q', service], { capture: true });
      assert.equal(await execute(`readonly-${service}`, docker, ['inspect', '--format', '{{.HostConfig.ReadonlyRootfs}}', container], { capture: true }), 'true');
    }
  }
  const db = client('stage0_app');
  await db.connect();
  try {
    const tls = await db.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()');
    assert.equal(tls.rows[0].ssl, true);
    const apiTls = await db.query("SELECT count(*)::int AS count, bool_and(s.ssl) AS encrypted FROM pg_stat_activity a JOIN pg_stat_ssl s USING(pid) WHERE a.usename='stage0_app' AND a.pid<>pg_backend_pid()");
    assert.ok(apiTls.rows[0].count >= 2);
    assert.equal(apiTls.rows[0].encrypted, true);
  } finally { await db.end(); }
  const securityDb=client('stage0_app');
  await securityDb.connect();
  try { securityChecks=await checkSecurity({urls:[dotnetUrl,nestjsUrl],db:securityDb,users,root,resultsDir}); }
  finally { await securityDb.end(); }
  currentIdentity=await login(webUrl,users.alice);
  await baseline('dotnet');
  await switchBackend('api-nestjs:3000');
  await baseline('nestjs');
  await switchBackend('api-dotnet:8080');
  const saved = [];
  for (const fixture of ['report-a4', 'report-ticket-80', 'price-label']) {
    const body = JSON.parse(await readFile(path.join(root, 'e2e/stage0/fixtures', fixture + '.json'), 'utf8'));
    if (fixture === 'price-label') body.template_json.containerImageSample = 'x'.repeat(1024 * 1024);
    saved.push(await request('POST', '/api/templates', { ...body, nombre: body.nombre + ' Docker rollback' }, 201));
  }
  await switchBackend('api-nestjs:3000');
  for (const row of saved) {
    assert.deepEqual(await request('GET', `/api/templates/${row.id}`), row);
    const changed = await request('PUT', `/api/templates/${row.id}/design`, { template_json: { ...row.template_json, dockerRollback: { unicode: 'ñ 漢字', amount: 1.2345 } } });
    assert.equal(changed.version, 2);
    Object.assign(row, changed);
  }
  await switchBackend('api-dotnet:8080');
  for (const row of saved) {
    assert.deepEqual(await request('GET', `/api/templates/${row.id}`), row);
    await request('DELETE', `/api/templates/${row.id}`);
  }
  // The final editor run confirms switching back restores actual browser/save/render flows.
  await baseline('dotnet-return');
  const testDb=client('stage0_app');
  await testDb.connect();
  try { await testDb.query('DELETE FROM auth_login_limits'); } finally { await testDb.end(); }
  // Use Linux dependencies from the same build stage, never the host's Windows native modules.
  const testsImage=`${project}/nestjs-tests:${project}`;
  await compose('nestjs-test-image',['--profile','test-tools','build','nestjs-tests']);
  const testEnvironment=path.join(secrets,'nestjs-test.env');
  await writeFile(testEnvironment,Object.entries({DB_HOST:'pg-test',DB_PORT:'5432',DB_NAME:database,DB_USERNAME:'stage0_app',DB_PASSWORD:password,
    NODE_ENV:'test',PGSSLMODE:'verify-full',NODE_EXTRA_CA_CERTS:'/run/tests/pg-ca.pem',STAGE0_RUN_ID:runId,STAGE8_TEST_USERS:'/run/tests/test-users.json'})
    .map(([key,value])=>key+'='+value).join('\n')+'\n',{mode:0o600});
  await execute('nestjs-regression',docker,['run','--rm','--name',project+'-nestjs-regression','--network',project+'_default',
    '--label','com.docker.compose.project='+project,'--label','com.docker.compose.service=nestjs-regression',
    '--env-file',testEnvironment,'--mount',`type=bind,src=${secrets},dst=/run/tests,readonly`,testsImage,
    'node','node_modules/jest/bin/jest.js','--config','test/jest-e2e.json','--runInBand','--forceExit']);
  const images = await execute('image-identities', docker, ['image', 'inspect', ...['web', 'api-dotnet', 'api-nestjs'].map(name => `${project}/${name}:${project}`),
    '--format', '{{json .}}'], { capture: true });
  await writeFile(path.join(resultsDir, 'stage8.json'), JSON.stringify({ passed: true, project, runId, dockerVersion: version,
    database, tls: true, hostNode: process.version, health: state.map(({ Service, State, Health }) => ({ Service, State, Health })),
    browserAndContractCases: 84, legacyNestCases:18, securityChecks, largeDocumentBytes: 1024 * 1024,
    rollback: '.NET → NestJS → .NET on the same packaged proxy and TLS database',
    images: images.split('\n').map(line => { const image = JSON.parse(line); return { id: image.Id, tags: image.RepoTags, user: image.Config.User }; }),
  }, null, 2));
  console.log('[stage8] Authentication, tenant isolation, Docker/TLS, editor and rollback checks passed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
    const report = JSON.parse(await readFile(path.join(resultsDir, 'stage8.json'), 'utf8').catch(() => 'null'));
    if (report) await writeFile(path.join(resultsDir, 'stage8.json'), JSON.stringify({ ...report, cleanup: 'verified: project containers and database volume removed; temporary secrets deleted' }, null, 2));
  } catch (error) {
    console.error('Isolated cleanup failed:', error.message);
    process.exitCode = 1;
    await writeFile(path.join(resultsDir, 'cleanup-failure.json'), JSON.stringify({ passed: false, cleanupError: error.message }, null, 2));
    const report = JSON.parse(await readFile(path.join(resultsDir, 'stage8.json'), 'utf8').catch(() => 'null'));
    if (report) await writeFile(path.join(resultsDir, 'stage8.json'), JSON.stringify({ ...report, passed: false, cleanup: 'failed', cleanupError: error.message }, null, 2));
  }
}
