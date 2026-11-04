import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const child = spawn(process.env.DOTNET_HOST_PATH || 'dotnet', [
  'run', '--project', 'src/ReportDesigner.Api', '--launch-profile', 'http', ...process.argv.slice(2),
], {
  cwd: fileURLToPath(new URL('../backend-dotnet/', import.meta.url)),
  stdio: 'inherit', windowsHide: true,
});
child.once('error', error => {
  console.error(`Cannot launch the .NET SDK (${error.code}). Install .NET 10 or set DOTNET_HOST_PATH.`);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
