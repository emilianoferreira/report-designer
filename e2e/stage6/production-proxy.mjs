import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function startProductionProxy({ root, runDir, name, port, apiUrl, frontendRoot, launchExecutable, waitForExit }) {
  const executable = process.env.NGINX_HOST_PATH;
  if (!executable || !path.isAbsolute(executable)) throw new Error('Set NGINX_HOST_PATH to an absolute local nginx executable path.');
  const directory = path.join(runDir, name);
  await mkdir(path.join(directory, 'logs'), { recursive: true });
  await mkdir(path.join(directory, 'temp'), { recursive: true });
  const forwardPath = value => value.replaceAll('\\', '/');
  const endpoint = new URL(apiUrl);
  if (endpoint.hostname !== '127.0.0.1' || endpoint.protocol !== 'http:') throw new Error('Production preview may proxy only to the isolated loopback APIs.');
  const template = await readFile(path.join(root, 'deployment/nginx/default.conf.template'), 'utf8');
  // Same production server block. Only ports, upstream DNS and static-root paths differ locally.
  const server = template.replaceAll('${API_UPSTREAM}', endpoint.host)
    .replace('listen 8080;', `listen 127.0.0.1:${port};`)
    .replace('root /usr/share/nginx/html;', `root "${forwardPath(frontendRoot)}";`);
  const mimeTypes = process.env.NGINX_MIME_TYPES || (process.platform === 'win32'
    ? path.join(path.dirname(executable), 'conf/mime.types') : '/etc/nginx/mime.types');
  await writeFile(path.join(directory, 'server.conf'), server);
  await writeFile(path.join(directory, 'nginx.conf'), `
daemon off;
master_process off;
pid logs/nginx.pid;
error_log logs/error.log;
events { worker_connections 256; }
http {
  include "${forwardPath(mimeTypes)}";
  default_type application/octet-stream;
  access_log logs/access.log;
  include "${forwardPath(path.join(directory, 'server.conf'))}";
}
`);
  const args = ['-p', forwardPath(directory) + '/', '-c', 'nginx.conf'];
  await waitForExit(launchExecutable(`${name}-syntax`, executable, [...args, '-t'], process.env), 'nginx configuration');
  const child = launchExecutable(name, executable, args, process.env);
  return { child, url: `http://127.0.0.1:${port}` };
}
