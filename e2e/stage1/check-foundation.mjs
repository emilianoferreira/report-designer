import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Called only after the stage0 runner has created and verified its disposable database.
export async function checkFoundation({ root, env, dbPort, database, password, freePort, launchExecutable, waitForExit, resultsDir }) {
  const dotnet = process.env.DOTNET_HOST_PATH || 'dotnet';
  const directory = path.join(root, 'backend-dotnet');
  const dll = path.join(directory, 'src/ReportDesigner.Api/bin/Release/net10.0/ReportDesigner.Api.dll');
  const baseEnv = {
    ...env, DOTNET_CLI_HOME: path.join(root, 'tmp/dotnet-home'),
    NUGET_PACKAGES: path.join(root, 'tmp/nuget-packages'),
    DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_GENERATE_ASPNET_CERTIFICATE: 'false',
    ASPNETCORE_ENVIRONMENT: 'Development',
  };
  console.log('[stage1] Restoring locked packages and building ASP.NET Core.');
  await waitForExit(launchExecutable('dotnet-restore', dotnet, ['restore', 'ReportDesigner.slnx', '--locked-mode'], baseEnv, directory), 'dotnet restore');
  await waitForExit(launchExecutable('dotnet-build', dotnet, ['build', 'ReportDesigner.slnx', '-c', 'Release', '--no-restore'], baseEnv, directory), 'dotnet build');

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const connection = `Host=127.0.0.1;Port=${dbPort};Database=${database};Username=stage0_app;Password=${password};Timeout=2;Command Timeout=3;Options=-c default_transaction_read_only=on`;
  const start = (name, connectionString) => launchExecutable(name, dotnet, [dll], {
    ...baseEnv, ASPNETCORE_URLS: baseUrl, ConnectionStrings__Postgres: connectionString,
  }, path.dirname(dll));

  async function response(child, route, status) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      assert.equal(child.exitCode, null, 'ASP.NET Core exited before responding');
      try {
        const result = await fetch(baseUrl + route, { signal: AbortSignal.timeout(5000) });
        assert.equal(result.status, status, route);
        return result;
      } catch (error) {
        // Only retry a connection that is not listening yet; assertion failures are real failures.
        if (error.code === 'ERR_ASSERTION') throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`ASP.NET Core readiness timeout: ${route}`);
  }
  async function stop(child) {
    child.kill('SIGTERM');
    await child.completed;
  }

  const healthy = start('dotnet-api', connection);
  try {
    assert.equal(await (await response(healthy, '/health/live', 200)).text(), 'Healthy');
    assert.equal(await (await response(healthy, '/health/ready', 200)).text(), 'Healthy');
    const reference = await response(healthy, '/reference/openapi.json', 200);
    assert.equal(await reference.text(), await readFile(path.join(root, 'contracts/openapi.json'), 'utf8'));
    const contract = JSON.parse(await readFile(path.join(root, 'contracts/openapi.json'), 'utf8'));
    for (const [route, operations] of Object.entries(contract.paths)) {
      for (const method of Object.keys(operations).filter(key => key !== 'parameters')) {
        if (route.startsWith('/api/templates')) continue;
        const result = await fetch(baseUrl + route.replace('{id}', '00000000-0000-0000-0000-000000000000'), { method: method.toUpperCase() });
        assert.ok([404, 405].includes(result.status), `${method} ${route} must remain unimplemented`);
      }
    }
    const { checkTemplateQueries } = await import('../stage2/check-template-queries.mjs');
    await checkTemplateQueries({ root, env, baseUrl, resultsDir });
  } finally { await stop(healthy); }

  const unavailable = start('dotnet-unavailable', connection.replace(`Password=${password}`, 'Password=deliberately-wrong'));
  try {
    assert.equal(await (await response(unavailable, '/health/live', 200)).text(), 'Healthy');
    assert.equal(await (await response(unavailable, '/health/ready', 503)).text(), 'Unhealthy');
    for (const route of ['/api/templates', '/api/templates/00000000-0000-0000-0000-000000000000']) {
      assert.deepEqual(await (await response(unavailable, route, 500)).json(), { statusCode: 500, message: 'Internal server error' });
    }
  } finally { await stop(unavailable); }

  const missing = start('dotnet-missing-config', '');
  const exit = await Promise.race([
    missing.completed,
    new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Missing configuration did not stop startup')), 15_000); timer.unref(); }),
  ]);
  assert.notEqual(exit.code, 0, 'Missing database configuration must fail startup');
  const writable = start('dotnet-writes', connection.replace(';Options=-c default_transaction_read_only=on', ''));
  await response(writable, '/health/ready', 200);
  const { checkTemplateCommands } = await import('../stage3/check-template-commands.mjs');
  await checkTemplateCommands({ root, env, baseUrl, resultsDir });
  await writeFile(path.join(resultsDir, 'stage1.json'), JSON.stringify({
    passed: true, checks: ['build', 'liveness', 'postgres-readiness', 'unchanged-contract-reference', 'unmigrated-routes-unavailable', 'unavailable-database-errors', 'missing-config-fails-startup'],
  }, null, 2));
  console.log('[stage1] Foundation checks passed; continuing with all NestJS stage0 tests.');
  return { baseUrl };
}
