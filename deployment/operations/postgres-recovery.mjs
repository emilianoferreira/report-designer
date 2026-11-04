import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(new URL('../../server/package.json',import.meta.url));
const { Client } = require('pg');
const pgpass = require('pgpass/lib/helper.js');
export const identifier = value => '"'+value.replaceAll('"','""')+'"';

async function privateFile(file) {
  assert.ok(path.isAbsolute(file),'Use an absolute private file path');
  const entry=await lstat(file);
  assert.ok(entry.isFile()&&!entry.isSymbolicLink(),'Expected a regular private file');
  assert.equal(entry.mode&0o077,0,'Private file must not grant group/other access');
}
export async function connect(config) {
  await privateFile(config.passfile);
  const password=await new Promise(resolve=>pgpass.getPassword(config,createReadStream(config.passfile),resolve));
  assert.ok(password,'No matching credential in the explicit passfile');
  const client=new Client({host:config.host,port:config.port,user:config.user,database:config.database,password,
    ssl:{ca:await readFile(config.caFile,'utf8'),rejectUnauthorized:true},connectionTimeoutMillis:10000});
  await client.connect();
  const tls=(await client.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0];
  assert.equal(tls?.ssl,true,'PostgreSQL TLS is required');
  return client;
}

// toolCommand can place the same libpq tools inside the isolated PostgreSQL container.
function tool(name,args,config,toolCommand) {
  const environment={...process.env};
  for(const key of Object.keys(environment))if(key.startsWith('PG'))delete environment[key];
  Object.assign(environment,{PGHOST:config.host,PGPORT:String(config.port),PGDATABASE:config.database,PGUSER:config.user,
    PGPASSFILE:config.passfile,PGSSLMODE:'verify-full',PGSSLROOTCERT:config.caFile,PGCONNECT_TIMEOUT:'10'});
  const command=toolCommand?toolCommand(name,args,config):{binary:name,args,env:environment};
  const child=spawn(command.binary,command.args,{env:command.env||environment,stdio:['pipe','pipe','pipe'],windowsHide:true});
  let detail='';
  child.stderr.on('data',data=>{if(detail.length<65536)detail+=data.toString();});
  child.done=new Promise((resolve,reject)=>{
    child.once('error',reject);
    child.once('close',code=>{
      if(code===0)resolve();else {const error=new Error(`${name} failed (${code}); private diagnostic available`);error.privateDiagnostic=detail;reject(error);}
    });
  });
  child.done.catch(()=>{});
  return child;
}
async function toolText(name,args,config,toolCommand) {
  const child=tool(name,args,config,toolCommand);let output='';
  child.stdout.on('data',data=>{output+=data.toString();});child.stdin.end();
  await child.done;return output.trim();
}
export async function fileHash(file) {
  const digest=createHash('sha256');let bytes=0;
  for await(const chunk of createReadStream(file)){digest.update(chunk);bytes+=chunk.length;}
  return {sha256:digest.digest('hex'),bytes};
}
async function beginSnapshot(client) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  await client.query("SET LOCAL datestyle='ISO, YMD'");
  await client.query('SET LOCAL extra_float_digits=3');
}
export async function fingerprint(client) {
  const tables=(await client.query(`SELECT n.nspname AS schema,c.relname AS name,
    ARRAY(SELECT a.attname::text FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(num,pos)
      JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num
      WHERE i.indrelid=c.oid AND i.indisprimary ORDER BY k.pos) AS keys
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p','m') AND n.nspname!~'^pg_' AND n.nspname<>'information_schema'
    ORDER BY n.nspname,c.relname`)).rows;
  const data=[];
  for(const table of tables) {
    const name=identifier(table.schema)+'.'+identifier(table.name);
    const order=table.keys.length?table.keys.map(key=>'t.'+identifier(key)).join(','):'to_jsonb(t)::text COLLATE "C"';
    await client.query(`DECLARE recovery_rows NO SCROLL CURSOR FOR SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS hash FROM ONLY ${name} t ORDER BY ${order}`);
    const digest=createHash('sha256');let rows=0;
    try { for(;;){const batch=(await client.query('FETCH 1000 FROM recovery_rows')).rows;if(!batch.length)break;
      for(const row of batch){digest.update(row.hash+'\n');rows++;}} }
    finally{await client.query('CLOSE recovery_rows');}
    data.push({schema:table.schema,name:table.name,rows,sha256:digest.digest('hex')});
  }
  const definitions=(await client.query(`
    SELECT 'column' AS kind,n.nspname||'.'||c.relname||'.'||a.attnum AS name,
      jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid))::text AS definition
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE c.relkind IN ('r','p','m','v') AND a.attnum>0 AND NOT a.attisdropped AND n.nspname!~'^pg_' AND n.nspname<>'information_schema'
    UNION ALL SELECT 'constraint',n.nspname||'.'||c.relname||'.'||x.conname,pg_get_constraintdef(x.oid,true)
      FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname!~'^pg_' AND n.nspname<>'information_schema'
    UNION ALL SELECT 'index',schemaname||'.'||indexname,indexdef FROM pg_indexes WHERE schemaname!~'^pg_' AND schemaname<>'information_schema'
    UNION ALL SELECT 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind IN ('f','p','w') AND n.nspname!~'^pg_' AND n.nspname<>'information_schema'
    UNION ALL SELECT 'view',schemaname||'.'||viewname,definition FROM pg_views WHERE schemaname!~'^pg_' AND schemaname<>'information_schema'
    UNION ALL SELECT 'extension',e.extname,e.extversion||':'||n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
    ORDER BY kind,name`)).rows;
  const sequences=(await client.query("SELECT schemaname,sequencename,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value FROM pg_sequences WHERE schemaname!~'^pg_' ORDER BY schemaname,sequencename")).rows;
  return {tables:data,schemaSha256:createHash('sha256').update(JSON.stringify(definitions)).digest('hex'),sequences};
}
export async function inspectDatabase(client) {
  const {rows:[database]}=await client.query(`SELECT current_database() AS name,current_setting('server_version_num')::int AS version,
    pg_encoding_to_char(encoding) AS encoding,datcollate AS collate,datctype AS ctype FROM pg_database WHERE datname=current_database()`);
  return database;
}
export async function fingerprintDatabase(config) {
  const client=await connect(config);
  try {await beginSnapshot(client);const value=await fingerprint(client);await client.query('COMMIT');return value;}
  finally {await client.end();}
}
async function privateDirectory(directory) {
  assert.ok(path.isAbsolute(directory),'Use an absolute backup directory');
  await mkdir(directory,{recursive:true,mode:0o700});
  const entry=await lstat(directory);
  assert.ok(entry.isDirectory()&&!entry.isSymbolicLink());
  assert.equal(entry.mode&0o077,0,'Backup directory must be private (0700)');
  return realpath(directory);
}

export async function backupDatabase({source,directory,recipient,toolCommand}) {
  assert.equal(process.platform,'linux','Operations require Linux clients and private Unix permissions');
  assert.match(recipient,/^age1[a-z0-9]+$/,'Use an age public recipient, never a private identity');
  const folder=await privateDirectory(directory);
  const id=randomUUID(),archive=path.join(folder,`backup-${id}.dump.age`),partial=archive+'.partial';
  const client=await connect(source);
  let dump,encoder;
  try {
    const database=await inspectDatabase(client);
    const version=await toolText('pg_dump',['--version'],source,toolCommand);
    assert.equal(Number(version.match(/PostgreSQL\) (\d+)/)?.[1]),Math.floor(database.version/10000),'pg_dump must match the server major');
    await beginSnapshot(client);
    const snapshot=(await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
    const contents=await fingerprint(client);
    dump=tool('pg_dump',['--format=custom','--no-password','--lock-wait-timeout=10000','--snapshot='+snapshot],source,toolCommand);
    encoder=tool('age',['--recipient',recipient],source);
    await Promise.all([pipeline(dump.stdout,encoder.stdin),pipeline(encoder.stdout,createWriteStream(partial,{flags:'wx',mode:0o600})),dump.done,encoder.done]);
    await client.query('COMMIT');
    const integrity=await fileHash(partial);
    await rename(partial,archive);
    const manifest={format:1,id,createdAt:new Date().toISOString(),archive:path.basename(archive),...integrity,recipient,
      source:{host:source.host,port:source.port,user:source.user,...database},pgDumpVersion:version,contents};
    const manifestFile=archive+'.json';
    await writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    return {archive,manifestFile,manifest};
  } catch(error) {
    dump?.kill('SIGTERM');encoder?.kill('SIGTERM');
    await Promise.allSettled([dump?.done,encoder?.done]);
    await client.query('ROLLBACK').catch(()=>{});
    await unlink(partial).catch(()=>{});
    throw error;
  } finally {await client.end();}
}

export async function restoreAndVerify({archive,manifest,administration,targetDatabase,identityFile,toolCommand}) {
  assert.match(targetDatabase,/^restorecheck_[a-f0-9]{32}$/,'Restore validation only creates a fresh restorecheck_<uuid> database');
  assert.notEqual(targetDatabase,manifest.source.name,'Never restore over the source database');
  await privateFile(identityFile);await privateFile(archive);
  assert.deepEqual(await fileHash(archive),{sha256:manifest.sha256,bytes:manifest.bytes},'Encrypted backup checksum mismatch');
  const admin=await connect(administration);
  let decoder,restore,created=false;
  const target={...administration,database:targetDatabase};
  try {
    const server=await inspectDatabase(admin);
    assert.equal(Math.floor(server.version/10000),Math.floor(manifest.source.version/10000),'Restore server major must match the backup');
    const version=await toolText('pg_restore',['--version'],administration,toolCommand);
    assert.equal(Number(version.match(/PostgreSQL\) (\d+)/)?.[1]),Math.floor(server.version/10000));
    const literal=value=>"'"+value.replaceAll("'","''")+"'";
    await admin.query(`CREATE DATABASE ${identifier(targetDatabase)} TEMPLATE template0 ENCODING ${literal(manifest.source.encoding)} LC_COLLATE ${literal(manifest.source.collate)} LC_CTYPE ${literal(manifest.source.ctype)}`);
    created=true;
    decoder=tool('age',['--decrypt','--identity',identityFile,archive],target);
    restore=tool('pg_restore',['--no-password','--exit-on-error','--single-transaction','--no-owner','--no-privileges','--dbname='+targetDatabase],target,toolCommand);
    await Promise.all([pipeline(decoder.stdout,restore.stdin),decoder.done,restore.done]);
    const check=await connect(target);
    try {
      await beginSnapshot(check);
      const contents=await fingerprint(check);
      await check.query('COMMIT');
      assert.deepEqual(contents,manifest.contents,'Restored rows, schema, functions, constraints, indexes or sequences differ');
      // A disaster restore must not revive sessions that were revoked after the backup.
      if(contents.tables.some(t=>t.schema==='public'&&t.name==='auth_sessions'))
        await check.query('BEGIN; DELETE FROM auth_sessions; DELETE FROM auth_login_limits; COMMIT');
      return {verified:true,database:targetDatabase,tables:contents.tables.length,rows:contents.tables.reduce((n,t)=>n+t.rows,0),
        schemaSha256:contents.schemaSha256,sessionsRevoked:true,ownershipAndGrants:'not restored; apply explicit application grants',automaticPromotion:false};
    } finally {await check.end();}
  } catch(error) {
    decoder?.kill('SIGTERM');restore?.kill('SIGTERM');await Promise.allSettled([decoder?.done,restore?.done]);
    error.createdRestoreDatabase=created?targetDatabase:null;
    throw error;
  } finally {await admin.end();}
}
