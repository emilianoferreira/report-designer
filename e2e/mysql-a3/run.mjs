import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';

const root=fileURLToPath(new URL('../../',import.meta.url));
const execute=promisify(execFile);
const command=async(binary,args,env=process.env)=>(await execute(binary,args,{cwd:root,env,windowsHide:true,maxBuffer:8*1024*1024,timeout:300000})).stdout.trim();
assert.equal(await command('git',['branch','--show-current']),'codex/mysql-migration');
const id=randomUUID().replaceAll('-',''),name='a3-'+id,database='a3_'+id;
const directory=path.join(root,'e2e/test-results',name);await mkdir(directory,{recursive:true});
const docker=(...args)=>process.platform==='win32'?command('wsl',['-u','root','--exec','docker',...args]):command('docker',args);
const image='mysql:8.4.13@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902';
const password=randomBytes(24).toString('hex');
const evidence={passed:false,startedAt:new Date().toISOString(),reference:await command('git',['rev-parse','HEAD']),main:await command('git',['rev-parse','main']),database,image,node:process.version,sdk:await command('dotnet',['--version'])};
const require=createRequire(new URL('../../server/package.json',import.meta.url));
const {default:EmbeddedPostgres}=await import(pathToFileURL(require.resolve('embedded-postgres')).href);
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const pgDirectory=await mkdtemp(path.join(os.tmpdir(),'a3-postgres-'));
evidence.postgresDirectory=pgDirectory;
const pg=new EmbeddedPostgres({databaseDir:path.join(pgDirectory,'db'),user:'postgres',password,port,persistent:true,initdbFlags:['--encoding=UTF8','--locale=C'],onLog:()=>{},onError:()=>{}});
let db,created=false,pgStarted=false;
console.log('A3 evidence: '+directory);
try {
    await pg.initialise();await pg.start();pgStarted=true;db=pg.getPgClient();await db.connect();
    evidence.postgres=(await db.query('SELECT version() AS version')).rows[0].version;
    const corpus=[];
    for(const name of ['report-a4','report-ticket-80','price-label']){
        const fixture=JSON.parse(await readFile(path.join(root,'e2e/stage0/fixtures',name+'.json'),'utf8'));
        corpus.push({name,required:true,input:JSON.stringify(fixture.template_json)});
    }
    corpus.push(
        {name:'open-document',required:true,input:'{"unknown":{"text":"ñ 漢字 😀","empty":"","nil":null,"array":[false,0,"",null]},"price":123.4567}'},
        {name:'exact-number',required:true,input:'{"value":12345678901234567890.123456789,"fraction":0.12345678901234567890123456789}'},
        {name:'duplicate-key',required:true,input:'{"key":1,"key":2,"array":[3,2,3]}'},
        {name:'numeric-notation',required:true,input:'{"a":1.00,"b":1e2,"c":-0.00}'},
        {name:'json-null',required:true,input:'null'},
        {name:'large-1mb',required:true,input:JSON.stringify({extension:'x'.repeat(1024*1024)})},
        {name:'near-http-limit',required:true,input:JSON.stringify({extension:'x'.repeat(31*1024*1024)})},
        {name:'huge-exponent',required:false,input:'{"value":1e400}'},
        {name:'invalid-json',required:true,input:'{"broken":'}
    );
    for(const item of corpus){
        await writeFile(path.join(directory,item.name+'.input.json'),item.input);
        try{const value=(await db.query('SELECT $1::jsonb::text AS value',[item.input])).rows[0].value;await writeFile(path.join(directory,item.name+'.postgres.json'),value);item.postgresAccepted=true;}
        catch(e){item.postgresAccepted=false;item.postgresError=e.code;}
        item.sha256=createHash('sha256').update(item.input).digest('hex');item.bytes=Buffer.byteLength(item.input);delete item.input;
    }
    await writeFile(path.join(directory,'corpus.json'),JSON.stringify(corpus,null,2));
    await docker('run','--detach','--name',name,'--label','a3.owner='+id,'--publish','127.0.0.1::3306','--env','MYSQL_ROOT_PASSWORD='+password,'--env','MYSQL_USER=probe','--env','MYSQL_PASSWORD='+password,'--env','MYSQL_DATABASE='+database,image,'--max-allowed-packet=134217728','--default-time-zone=+00:00','--require-secure-transport=ON');created=true;
    let ready=false;
    for(let n=0;n<90;n++){try{await docker('exec','-e','MYSQL_PWD='+password,name,'mysql','--protocol=TCP','--ssl-mode=REQUIRED','-uprobe','-e','SELECT 1');ready=true;break;}catch{}await new Promise(r=>setTimeout(r,1000));}
    assert.ok(ready,'isolated MySQL ready');
    const inspect=JSON.parse(await docker('inspect',name))[0];
    const mysqlPort=inspect.NetworkSettings.Ports['3306/tcp'][0].HostPort;
    evidence.imageId=inspect.Image;
    await writeFile(path.join(directory,'ca.pem'),await docker('exec',name,'cat','/var/lib/mysql/ca.pem'));
    const connection=`Server=127.0.0.1;Port=${mysqlPort};Database=${database};User ID=probe;Password=${password};SslMode=VerifyCA;SslCa=${path.join(directory,'ca.pem')};Default Command Timeout=30;Connection Timeout=10`;
    const result=await command('dotnet',['run','--no-build','--project','backend-dotnet/probes/MySqlStage3/MySqlStage3.csproj'],{...process.env,A3_ID:id,A3_DIRECTORY:directory,A3_CONNECTION:connection});
    console.log(result);evidence.provider=JSON.parse(await readFile(path.join(directory,'provider.json'),'utf8'));
    const comparisons=JSON.parse(await readFile(path.join(directory,'json-comparison.json'),'utf8'));
    evidence.storage=Object.fromEntries(['native','text'].map(storage=>[storage,{requiredFailures:comparisons.filter(c=>c.storage===storage&&c.required&&(c.accepted!==c.postgresAccepted||(c.accepted&&c.semanticEqual!==true))).map(c=>c.name)}]));
    evidence.passed=evidence.provider.passed&&Object.values(evidence.storage).some(x=>x.requiredFailures.length===0);
    console.log(JSON.stringify(evidence.storage));
}catch(e){evidence.error=(e.message||String(e)).replaceAll(password,'[redacted]');console.error(evidence.error);process.exitCode=1;}
finally{
    try{if(db)await db.end();if(pgStarted)await pg.stop();}
    catch{evidence.postgresCleanup='failed';evidence.passed=false;process.exitCode=1;}
    if(created){
        try{assert.equal(await docker('inspect','--format','{{index .Config.Labels "a3.owner"}}',name),id);await docker('rm','--force','--volumes',name);evidence.cleanup='owned container and anonymous volumes removed; temporary PostgreSQL stopped and retained';}
        catch(e){evidence.cleanup='failed';evidence.passed=false;process.exitCode=1;console.error('Owned-container cleanup failed');}
    }
    evidence.finishedAt=new Date().toISOString();
    await writeFile(path.join(directory,'report.json'),JSON.stringify(evidence,null,2));
}
if(!evidence.passed)process.exitCode=1;
