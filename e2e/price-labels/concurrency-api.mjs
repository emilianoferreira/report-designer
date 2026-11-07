import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { seedIdentities, checkSecurity } from '../stage8/check-security.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../server/package.json', import.meta.url));
const { default: EmbeddedPostgres } = await import(pathToFileURL(require.resolve('embedded-postgres')).href);
const directory = await mkdtemp(path.join(os.tmpdir(), 'labels-concurrency-'));
const freePort = async () => { const s=net.createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r)); const port=s.address().port; await new Promise(r=>s.close(r)); return port; };
const [dbPort,nestPort,dotnetPort] = await Promise.all([freePort(),freePort(),freePort()]);
const password=randomBytes(24).toString('hex');
const postgres=new EmbeddedPostgres({databaseDir:path.join(directory,'db'),user:'postgres',password,port:dbPort,persistent:true,initdbFlags:['--encoding=UTF8','--locale=C'],onLog:()=>{},onError:()=>{}});
const children=[]; let db;
const start=(command,args,env)=>{const child=spawn(command,args,{cwd:root,env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(child);let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);child.on('error',e=>log+=e.message);return {child,log:()=>log};};
try {
  await postgres.initialise(); await postgres.start(); console.log('Postgres ready'); db=postgres.getPgClient(); await db.connect(); console.log('Database connected');
  for(const file of ['001-schema.sql','002-seed.sql','003-view-invoice-data.sql','004-auth.sql']) await db.query(await readFile(path.join(root,'database',file),'utf8'));
  console.log('Schema ready'); const users=await seedIdentities(db); console.log('Users ready');
  const nest=start(process.execPath,['server/dist/src/main.js'],{DB_HOST:'127.0.0.1',DB_PORT:String(dbPort),DB_NAME:'postgres',DB_USERNAME:'postgres',DB_PASSWORD:password,PORT:String(nestPort),AUTH_SECURE_COOKIE:'false'});
  const dotnet=start('dotnet',['backend-dotnet/src/ReportDesigner.Api/bin/Debug/net10.0/ReportDesigner.Api.dll'],{ConnectionStrings__Postgres:'Host=127.0.0.1;Port='+dbPort+';Database=postgres;Username=postgres;Password='+password,ASPNETCORE_URLS:'http://127.0.0.1:'+dotnetPort,ASPNETCORE_ENVIRONMENT:'Development',Auth__SecureCookie:'false'});
  const urls=[nestPort,dotnetPort].map(p=>'http://127.0.0.1:'+p);
  for(const [i,url] of urls.entries()) {
    let ready=false;
    for(let n=0;n<120;n++){try{await fetch(url+'/api/auth/session',{signal:AbortSignal.timeout(1000)});ready=true;break;}catch{} await new Promise(r=>setTimeout(r,250));}
    if(!ready){await writeFile(path.join(directory,'startup.log'),[nest,dotnet][i].log());throw Error('API did not start; log: '+directory);}
  }
  console.log('APIs ready; running security and concurrency checks.');
  await checkSecurity({urls,db,users,root,resultsDir:directory});
  console.log('PASS: both APIs, real isolated PostgreSQL, concurrent revision checks and existing security regressions.');
} catch (error) { console.error(error); process.exitCode=1; } finally {
  console.log('Stopping isolated services');
  for(const child of children) { const done=new Promise(resolve=>child.once('exit',resolve)); if(child.exitCode===null && child.signalCode===null){child.kill();await done;} }
  if(db)await db.end();await postgres.stop();
}
