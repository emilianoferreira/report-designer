import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const server = path.join(root, 'server');
const requireServer = createRequire(path.join(server, 'package.json'));
const { default: EmbeddedPostgres } = await import(pathToFileURL(requireServer.resolve('embedded-postgres')));
const { Client } = requireServer('pg');
const runId = randomUUID();
const tempRoot = path.join(root, 'tmp');
const runDir = path.join(tempRoot, `stage0-${runId}`);
const resultsDir = path.join(root, 'e2e', 'test-results', `stage0-${runId}`);
const database = `stage0_${runId.replaceAll('-', '')}`;
const password = randomBytes(24).toString('hex');
const probeId = randomUUID();
const children = new Set();
const logs = [];
let postgres;
let pgStarted = false;
let cleanupPromise;
let dotnet;

const args = process.argv.slice(2);
if (args.some(arg => !['--record', '--with-dotnet'].includes(arg))) throw new Error('Only --record and --with-dotnet are supported.');
await mkdir(runDir, { recursive: true });
await mkdir(resultsDir, { recursive: true });

function logStream(name) {
  const stream = createWriteStream(path.join(resultsDir, `${name}.log`));
  logs.push(stream);
  return stream;
}

function launch(name, script, args, env, cwd = root) {
  return launchExecutable(name, process.execPath, [script, ...args], env, cwd);
}

function launchExecutable(name, executable, args, env, cwd = root) {
  const output = logStream(name);
  const child = spawn(executable, args, {
    cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  child.stdout.pipe(output, { end: false });
  child.stderr.pipe(output, { end: false });
  child.completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      children.delete(child);
      resolve({ code, signal });
    });
  });
  // Readiness or waitForExit reports errors, including early startup failures.
  child.completed.catch(() => {});
  return child;
}

async function waitForExit(child, name) {
  const { code, signal } = await child.completed;
  if (code !== 0) throw new Error(`${name} failed (${code ?? signal}); see ${resultsDir}`);
}

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

async function ready(url, child, name) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`${name} exited before readiness; see ${resultsDir}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch { /* The process is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`${name} readiness timeout; see ${resultsDir}`);
}

async function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    for (const child of [...children].reverse()) {
      child.kill('SIGTERM');
      await Promise.race([child.completed.catch(() => {}), new Promise(resolve => setTimeout(resolve, 5000))]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await child.completed.catch(() => {});
      }
    }
    if (pgStarted) await postgres.stop();
    // Delete only this run's verified directory. Never remove an external DB/path.
    const resolvedBase = await realpath(tempRoot);
    const resolvedRun = await realpath(runDir);
    if (path.dirname(resolvedRun) !== resolvedBase || path.basename(resolvedRun) !== `stage0-${runId}`) {
      throw new Error('Refusing cleanup outside the disposable stage0 directory.');
    }
    await rm(resolvedRun, { recursive: true });
    for (const stream of logs) stream.end();
  })();
  return cleanupPromise;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    cleanup().then(() => process.exit(130)).catch(error => {
      console.error(error);
      process.exit(1);
    });
  });
}

try {
  console.log(`[stage0] Run ${runId}; artifacts: ${resultsDir}`);
  // Every connection variable is explicit. Existing .env values cannot select a DB.
  const env = { ...process.env, NODE_ENV: 'test', TZ: 'UTC', NG_CLI_ANALYTICS: 'false' };
  console.log('[stage0] Building the existing NestJS backend.');
  await waitForExit(launch('build', requireServer.resolve('@nestjs/cli/bin/nest.js'), ['build'], env, server), 'Nest build');
  const dbPort = await freePort();
  const apiPort = await freePort();
  const uiPort = await freePort();
  if (new Set([dbPort, apiPort, uiPort]).size !== 3) throw new Error('Port collision; rerun.');
  const pgLog = logStream('postgres');
  postgres = new EmbeddedPostgres({
    databaseDir: path.join(runDir, 'postgres'),
    user: 'stage0_admin', password, port: dbPort,
    persistent: true, createPostgresUser: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-h', '127.0.0.1', '-c', 'timezone=UTC'],
    onLog: message => pgLog.write(String(message) + '\n'),
    onError: message => pgLog.write(String(message) + '\n'),
  });
  await postgres.initialise();
  await postgres.start();
  pgStarted = true;
  await postgres.createDatabase(database);
  const admin = postgres.getPgClient(database, '127.0.0.1');
  await admin.connect();
  try {
    for (const name of ['001-schema.sql', '002-seed.sql', '003-view-invoice-data.sql']) {
      await admin.query(await readFile(path.join(root, 'database', name), 'utf8'));
    }
    await admin.query('CREATE TABLE stage0_test_guard (run_id text PRIMARY KEY)');
    await admin.query('INSERT INTO stage0_test_guard VALUES ($1)', [runId]);
    await admin.query('INSERT INTO report_templates (id, company_id, nombre, template_json) VALUES ($1, $2, $3, $4)',
      [probeId, 'c1000000-0000-0000-0000-000000000001', 'stage0-isolation-probe', { runId }]);
    // The application is not the cluster owner and cannot create/drop databases.
    await admin.query(`CREATE ROLE stage0_app LOGIN PASSWORD '${password}'`);
    await admin.query('GRANT USAGE ON SCHEMA public TO stage0_app');
    await admin.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO stage0_app');
    await admin.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO stage0_app');
    const version = (await admin.query('SHOW server_version')).rows[0].server_version;
    await writeFile(path.join(resultsDir, 'environment.json'), JSON.stringify({
      runId, database, postgresVersion: version, node: process.version,
      apiPort, uiPort, dbPort, recorded: args.includes('--record'),
    }, null, 2));
    console.log(`[stage0] PostgreSQL ${version}; isolated database ${database}.`);
  } finally { await admin.end(); }

  Object.assign(env, {
    DB_HOST: '127.0.0.1', DB_PORT: String(dbPort), DB_USERNAME: 'stage0_app',
    DB_PASSWORD: password, DB_NAME: database, PORT: String(apiPort),
    STAGE0_RUN_ID: runId, STAGE0_API_URL: `http://127.0.0.1:${apiPort}`,
    STAGE0_UI_URL: `http://127.0.0.1:${uiPort}`, STAGE0_RESULTS_DIR: resultsDir,
    STAGE0_RECORD: args.includes('--record') ? '1' : '0',
  });
  const proxyFile = path.join(runDir, 'proxy.json');
  await writeFile(proxyFile, JSON.stringify({ '/api': { target: env.STAGE0_API_URL, secure: false } }));
  const api = launch('api', path.join(server, 'dist', 'src', 'main.js'), [], env, server);
  await ready(`${env.STAGE0_API_URL}/api/templates`, api, 'API');
  const probe = await fetch(`${env.STAGE0_API_URL}/api/templates/${probeId}`).then(response => response.json());
  if (probe.template_json?.runId !== runId) throw new Error('API is not connected to this isolated database.');
  const probeClient = postgres.getPgClient(database, '127.0.0.1');
  await probeClient.connect();
  try { await probeClient.query('DELETE FROM report_templates WHERE id = $1', [probeId]); }
  finally { await probeClient.end(); }
  if (args.includes('--with-dotnet')) {
    const { checkFoundation } = await import('../stage1/check-foundation.mjs');
    dotnet = await checkFoundation({ root, env, dbPort, database, password, freePort, launchExecutable, waitForExit, resultsDir });
  }
  const ui = launch('angular', path.join(root, 'node_modules/@angular/cli/bin/ng.js'), [
    'serve', '--host', '127.0.0.1', '--port', String(uiPort), '--proxy-config', proxyFile,
  ], env);
  await ready(env.STAGE0_UI_URL, ui, 'Angular');

  console.log('[stage0] Running HTTP contracts and save/reload/render browser tests.');
  const playwright = launch('playwright', path.join(root, 'node_modules/@playwright/test/cli.js'), [
    'test', '--config', 'e2e/playwright.stage0.config.ts',
  ], env);
  playwright.stdout.pipe(process.stdout);
  playwright.stderr.pipe(process.stderr);
  await waitForExit(playwright, 'Stage 0 tests');

  console.log('[stage0] Running the 18 existing backend tests on the same isolated cluster.');
  const jest = launch('legacy-backend', requireServer.resolve('jest/bin/jest'), [
    '--config', './test/jest-e2e.json', '--runInBand', '--forceExit',
  ], env, server);
  jest.stdout.pipe(process.stdout);
  jest.stderr.pipe(process.stderr);
  await waitForExit(jest, 'Existing backend tests');

  if (dotnet) {
    console.log('[stage4] Running all 25 API/editor baseline tests against .NET with a temporary test proxy.');
    const dotnetUiPort = await freePort();
    const dotnetProxy = path.join(runDir, 'dotnet-proxy.json');
    await writeFile(dotnetProxy, JSON.stringify({ '/api': { target: dotnet.baseUrl, secure: false } }));
    const dotnetResults = path.join(resultsDir, 'dotnet-regression');
    await mkdir(dotnetResults, { recursive: true });
    const dotnetEnv = { ...env, STAGE0_API_URL: dotnet.baseUrl, STAGE0_UI_URL: `http://127.0.0.1:${dotnetUiPort}`,
      STAGE0_RESULTS_DIR: dotnetResults, STAGE0_RECORD: '0' };
    const dotnetUi = launch('angular-dotnet', path.join(root, 'node_modules/@angular/cli/bin/ng.js'), [
      'serve', '--host', '127.0.0.1', '--port', String(dotnetUiPort), '--proxy-config', dotnetProxy,
    ], dotnetEnv);
    await ready(dotnetEnv.STAGE0_UI_URL, dotnetUi, 'Angular .NET test proxy');
    const regression = launch('playwright-dotnet', path.join(root, 'node_modules/@playwright/test/cli.js'), [
      'test', '--config', 'e2e/playwright.stage0.config.ts',
    ], dotnetEnv);
    regression.stdout.pipe(process.stdout);
    regression.stderr.pipe(process.stderr);
    await waitForExit(regression, 'ASP.NET Core baseline regression');
  }

  // A final connection confirms which cluster was used, without relying on UI fallback.
  const client = new Client({ host: '127.0.0.1', port: dbPort, user: 'stage0_app', password, database });
  await client.connect();
  try {
    const marker = await client.query('SELECT run_id FROM stage0_test_guard');
    if (marker.rows[0]?.run_id !== runId) throw new Error('Isolation marker mismatch.');
  } finally { await client.end(); }
  console.log('[stage0] All checks passed.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  try { await cleanup(); } catch (error) {
    console.error('[stage0] Cleanup failed; data retained for inspection:', error);
    process.exitCode = 1;
  }
}
