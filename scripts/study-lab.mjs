// Local learning tools only; no product configuration or existing database is used.
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const local = path.join(root, '.local/study');
export const database = 'report_designer_study';
const project = 'report-designer-study';
const volume = project + '_mysql-data';
const network = project + '_default';
const A = 'c1000000-0000-0000-0000-000000000001';
const B = 'c1000000-0000-0000-0000-000000000002';
const apiProject = 'src/ReportDesigner.Api/ReportDesigner.Api.csproj';
let secrets = [];
const redact = text => secrets.reduce((value, secret) => value.replaceAll(secret, '[private]'), String(text));
export const exists = file => access(file).then(() => true, () => false);
export async function privateWrite(name, content) {
  await writeFile(path.join(local, name), content, { mode: 0o600 });
}
export function command(bin, args, { input, cwd = root, env = process.env, inherit = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env, windowsHide: true, stdio: inherit ? 'inherit' : ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    if (!inherit) {
      child.stdout.on('data', data => stdout += data);
      child.stderr.on('data', data => stderr += data);
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(Error(redact(`${bin} exited ${code}: ${stderr || stdout}`))));
  });
}
export const docker = (...args) => process.platform === 'win32'
  ? command('wsl.exe', ['-u', 'root', '--exec', 'docker', ...args]) : command('docker', args);
const composeArgs = ['compose', '--project-name', project, '--env-file', '.local/study/compose.env', '--file', 'deployment/study.compose.yaml'];
export const compose = (...args) => docker(...composeArgs, ...args);
export async function loadState() {
  if (!await exists(path.join(local, 'state.json'))) throw Error('Run npm run study:setup first.');
  const state = JSON.parse(await readFile(path.join(local, 'state.json'), 'utf8'));
  if (!/^[0-9a-f-]{36}$/.test(state.owner)) throw Error('Invalid study ownership marker.');
  secrets = Object.values(state.passwords);
  return state;
}
const save = state => privateWrite('state.json', JSON.stringify(state, null, 2) + '\n');

// Never adopt pre-existing resources, even if they have the expected Compose name.
export async function assertOwnership(state, requireVolume = false) {
  const volumes = (await docker('volume', 'ls', '--format', '{{.Name}}')).split(/\r?\n/);
  if (volumes.includes(volume)) {
    const [item] = JSON.parse(await docker('volume', 'inspect', volume));
    if (!state || item.Labels?.['study.owner'] !== state.owner) throw Error('Study volume already exists with another owner. Nothing changed.');
  } else if (requireVolume) throw Error('The study data volume is missing. Refusing to create a replacement silently.');
  const networks = (await docker('network', 'ls', '--format', '{{.Name}}')).split(/\r?\n/);
  if (networks.includes(network)) {
    const [item] = JSON.parse(await docker('network', 'inspect', network));
    if (!state || item.Labels?.['study.owner'] !== state.owner) throw Error('Study network belongs to another owner.');
  }
  const ids = (await docker('ps', '-aq', '--filter', 'label=com.docker.compose.project=' + project)).split(/\s+/).filter(Boolean);
  if (ids.length) for (const item of JSON.parse(await docker('inspect', ...ids))) {
    if (!state || item.Config.Labels?.['study.owner'] !== state.owner) throw Error('Study container belongs to another owner.');
  }
}
export async function sql(text, { admin = false } = {}) {
  const args = [...composeArgs, 'exec', '-T', 'mysql', 'mysql',
    '--defaults-extra-file=/run/study/' + (admin ? 'admin.cnf' : 'reader.cnf'),
    '--default-character-set=utf8mb4', '--batch', '--raw', '--skip-column-names', database];
  return process.platform === 'win32'
    ? command('wsl.exe', ['-u', 'root', '--exec', 'docker', ...args], { input: text })
    : command('docker', args, { input: text });
}
export async function apiEnvironment() {
  return parseEnv(await readFile(path.join(local, 'api.env'), 'utf8'));
}
async function prepareFiles(state) {
  await privateWrite('compose.env', `STUDY_OWNER=${state.owner}\n`);
  await privateWrite('root-password', state.passwords.root + '\n');
  for (const [name, user, password] of [['admin', 'root', state.passwords.root], ['reader', 'study_reader', state.passwords.reader]]) {
    await privateWrite(name + '.cnf', `[client]\nuser=${user}\npassword=${password}\nhost=127.0.0.1\nprotocol=TCP\nssl-mode=VERIFY_CA\nssl-ca=/var/lib/mysql/ca.pem\n`);
  }
}
function connection(user, password) {
  // Generated passwords are hex; quote the CA path for checkouts containing spaces/semicolons.
  const ca = path.join(local, 'ca.pem').replaceAll('"', '""');
  return `Server=127.0.0.1;Port=3307;Database=${database};User ID=${user};Password=${password};SslMode=VerifyCA;SslCa="${ca}"`;
}
async function runtimeFiles(state) {
  await privateWrite('api.env', [
    'Database__Provider=MySql',
    `ConnectionStrings__MySql='${connection('study_app', state.passwords.app)}'`,
    'InvoiceData__TimeZone=America/Montevideo',
    'ASPNETCORE_ENVIRONMENT=Development', 'DOTNET_ENVIRONMENT=Development',
    'ASPNETCORE_URLS=http://127.0.0.1:5080', 'Auth__SecureCookie=false',
    'Logging__LogLevel__Microsoft.EntityFrameworkCore.Database.Command=Information', ''
  ].join('\n'));
  await privateWrite('credentials.txt', [
    'LOCAL STUDY ONLY. Do not commit, share or import into a cloud workspace.',
    'Postman email: estudiante@example.test', `Postman password: ${state.passwords.login}`,
    `MySQL: 127.0.0.1:3307 / ${database}`, 'Read-only SQL user: study_reader',
    `Read-only SQL password: ${state.passwords.reader}`, `CA: ${path.join(local, 'ca.pem')}`, ''
  ].join('\n'));
  const environment = JSON.parse(await readFile(path.join(root, 'docs/study.postman_environment.json'), 'utf8'));
  environment.values.find(value => value.key === 'password').value = state.passwords.login;
  await privateWrite('postman.environment.json', JSON.stringify(environment, null, 2) + '\n');
}
async function build(projectFile = apiProject) {
  console.log('Restoring locked dependencies and building Debug...');
  const cwd = path.join(root, 'backend-dotnet');
  await command(process.env.DOTNET_HOST_PATH || 'dotnet', ['restore', projectFile, '--locked-mode'], { cwd });
  await command(process.env.DOTNET_HOST_PATH || 'dotnet', ['build', projectFile, '-c', 'Debug', '--no-restore', '-m:1'], { cwd });
}
async function setup() {
  if (await command('git', ['branch', '--show-current']) !== 'codex/mysql-migration') throw Error('Use branch codex/mysql-migration.');
  let state;
  if (await exists(path.join(local, 'state.json'))) state = await loadState();
  await assertOwnership(state, Boolean(state?.schema));
  if (!state) {
    await mkdir(local, { recursive: true, mode: 0o700 });
    if (process.platform === 'win32') {
      const account = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
      await command('icacls', [local, '/inheritance:r', '/grant:r', `${account}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F']);
    }
    state = { owner: randomUUID(), passwords: Object.fromEntries(['root', 'app', 'reader', 'provisioner', 'login'].map(key => [key, randomBytes(24).toString('hex')])) };
    secrets = Object.values(state.passwords);
    await save(state);
  }
  await prepareFiles(state);
  console.log('Starting only the dedicated study MySQL (TLS, localhost:3307)...');
  await compose('up', '-d', '--wait', '--wait-timeout', '150', 'mysql');
  await assertOwnership(state, true);
  await privateWrite('ca.pem', await compose('exec', '-T', 'mysql', 'cat', '/var/lib/mysql/ca.pem'));
  if (!state.schema) {
    const tables = await sql('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE();', { admin: true });
    if (tables !== '0') throw Error('Nonempty database without completed schema marker. Inspect the isolated initialization failure; no reset was performed.');
    for (const file of ['001-schema.sql', '002-json-precision.sql']) {
      await sql(await readFile(path.join(root, 'database/mysql', file), 'utf8'), { admin: true });
    }
    state.schema = true; await save(state);
  }
  if (!state.seeded) {
    if (await sql('SELECT COUNT(*) FROM companies;', { admin: true }) !== '0') throw Error('Seed requires an empty study database; no data overwritten.');
    await sql(await readFile(path.join(root, 'database/mysql/003-study-seed.sql'), 'utf8'), { admin: true });
    state.seeded = true; await save(state);
  }
  if (!state.provisioned) {
    console.log('Provisioning private, least-privilege study accounts...');
    let grants = '';
    for (const [user, password] of [['study_app', state.passwords.app], ['study_reader', state.passwords.reader], ['study_provisioner', state.passwords.provisioner]]) {
      grants += `CREATE USER IF NOT EXISTS '${user}'@'%' IDENTIFIED BY '${password}' REQUIRE SSL;\n`;
    }
    const business = ['companies', 'invoices', 'invoice_types', 'invoice_lines', 'invoice_taxes', 'contacts', 'branches', 'currencies', 'articles', 'report_templates'];
    for (const table of business) grants += `GRANT SELECT ON ${database}.${table} TO 'study_reader'@'%';\n`;
    for (const table of [...business.filter(t => t !== 'articles'), 'auth_users', 'auth_memberships']) grants += `GRANT SELECT ON ${database}.${table} TO 'study_app'@'%';\n`;
    grants += `GRANT SELECT,INSERT,DELETE ON ${database}.auth_sessions TO 'study_app'@'%';
      GRANT SELECT,INSERT,UPDATE ON ${database}.auth_login_limits TO 'study_app'@'%';
      GRANT INSERT,UPDATE,DELETE ON ${database}.report_templates TO 'study_app'@'%';
      GRANT SELECT ON ${database}.companies TO 'study_provisioner'@'%';\n`;
    for (const table of ['auth_users', 'auth_memberships', 'auth_sessions']) grants += `GRANT SELECT,INSERT,UPDATE,DELETE ON ${database}.${table} TO 'study_provisioner'@'%';\n`;
    await sql(grants, { admin: true });
    await build('tools/ProvisionMySqlUser/ProvisionMySqlUser.csproj');
    await command(process.env.DOTNET_HOST_PATH || 'dotnet', ['backend-dotnet/tools/ProvisionMySqlUser/bin/Debug/net10.0/ProvisionMySqlUser.dll'], {
      env: { ...process.env, AUTH_MYSQL_CONNECTION: connection('study_provisioner', state.passwords.provisioner) },
      input: JSON.stringify({ email: 'estudiante@example.test', password: state.passwords.login, companies: [{ id: A, role: 'editor' }, { id: B, role: 'viewer' }] })
    });
    state.provisioned = true; await save(state);
  }
  await runtimeFiles(state);
  await build();
  state.ready = true; await save(state);
  console.log('Study lab ready. Secrets: .local/study/credentials.txt (private). F5: Estudio .NET + MySQL.');
}
async function main(action) {
  if (action === 'hold') {
    if (process.platform !== 'win32') { console.log('WSL hold is only needed on Windows.'); return; }
    console.log('Keeping WSL active for the study lab. Leave this terminal open; Ctrl+C after study:stop.');
    return command('wsl.exe', ['--exec', 'sleep', 'infinity'], { inherit: true });
  }
  if (action === 'setup') return setup();
  const state = await loadState();
  if (!state.ready) throw Error('Setup is incomplete. Run npm run study:setup.');
  if (action === 'build') return build();
  if (action === 'api') {
    await build();
    const child = spawn(process.env.DOTNET_HOST_PATH || 'dotnet', ['bin/Debug/net10.0/ReportDesigner.Api.dll'], {
      cwd: path.join(root, 'backend-dotnet/src/ReportDesigner.Api'), windowsHide: true,
      env: { ...process.env, ...await apiEnvironment() }, stdio: 'inherit'
    });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
    child.on('error', error => { console.error(redact(error.message)); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 0; });
    return;
  }
  await assertOwnership(state, true);
  if (action === 'up') {
    await compose('up', '-d', '--wait', '--wait-timeout', '150', 'mysql');
    console.log('MySQL ready at 127.0.0.1:3307. Existing data retained.');
  } else if (action === 'stop') {
    await compose('stop', 'mysql'); console.log('Study MySQL stopped; data volume retained.');
  } else if (action === 'status') console.log(await compose('ps', '-a'));
  else if (action === 'sql') {
    const query = process.argv[3] || 'SELECT id,nombre,version,updated_at FROM report_templates ORDER BY updated_at DESC;';
    console.log(await sql(query));
  } else throw Error('Use setup | up | stop | status | api | build | sql [query]. No reset command is provided.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(process.argv[2]); } catch (error) { console.error(redact(error.message)); process.exitCode = 1; }
}
