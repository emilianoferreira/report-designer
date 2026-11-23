import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomBytes,randomUUID,pbkdf2Sync,createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import net from 'node:net';
import {A,B,login,call} from '../stage8/check-security.mjs';
import {checkBrowser} from './browser.mjs';

export async function runMySql({verify}={}) {
const root=fileURLToPath(new URL('../../',import.meta.url)),exec=promisify(execFile);
const command=async(bin,args)=>(await exec(bin,args,{cwd:root,windowsHide:true,maxBuffer:8*1024*1024})).stdout.trim();
const id=randomUUID().replaceAll('-',''),name='a4-'+id,database='a4_'+id,password=randomBytes(24).toString('hex');
const directory=path.join(root,'e2e/test-results',name);await mkdir(directory,{recursive:true});console.log('A4 evidence: '+directory);
const image='mysql:8.4.13@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902';
const docker=(...args)=>process.platform==='win32'?command('wsl',['-u','root','--exec','docker',...args]):command('docker',args);
const sql=(text,user='root',db=database)=>new Promise((resolve,reject)=>{
    const args=['exec','-i','-e','MYSQL_PWD='+password,name,'mysql','--default-character-set=utf8mb4','--batch','--raw','--skip-column-names','--protocol=TCP','--ssl-mode=REQUIRED','-u'+user,db];
    const child=spawn(process.platform==='win32'?'wsl':'docker',process.platform==='win32'?['-u','root','--exec','docker',...args]:args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.on('error',reject);
    child.on('close',code=>code===0?resolve(stdout.trim()):reject(new Error(stderr.replaceAll(password,'[redacted]'))));child.stdin.end(text);
});
const report={passed:false,reference:await command('git',['rev-parse','HEAD']),main:await command('git',['rev-parse','main']),image,database,checks:[]};
let created=false;const children=[];const logs=[];
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
const rejectSql=async(text,code)=>{await assert.rejects(sql(text),new RegExp('ERROR '+code));report.checks.push('constraint '+code+': '+text.split(' ')[0]);};
const freePort=async()=>{const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;};
async function start(connection,extra={}) {
    const port=await freePort();let log='';
    const child=spawn('dotnet',['backend-dotnet/src/ReportDesigner.Api/bin/Debug/net10.0/ReportDesigner.Api.dll'],{cwd:root,windowsHide:true,env:{...process.env,Database__Provider:'MySql',ConnectionStrings__MySql:connection,ASPNETCORE_URLS:'http://127.0.0.1:'+port,ASPNETCORE_ENVIRONMENT:'Development',Auth__SecureCookie:'false',InvoiceData__TimeZone:'America/Montevideo',...extra},stdio:['ignore','pipe','pipe']});children.push(child);
    logs.push(()=>log.replaceAll(password,'[redacted]'));
    child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
    const url='http://127.0.0.1:'+port;
    for(let i=0;i<120;i++){try{const r=await fetch(url+'/health/live');if(r.ok)return url;}catch{}if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,250));}
    await writeFile(path.join(directory,'startup-failure.log'),log.replaceAll(password,'[redacted]'));throw Error('API did not start; see sanitized startup-failure.log');
}
try {
    await docker('run','--detach','--name',name,'--label','a4.owner='+id,'--publish','127.0.0.1::3306','--env','MYSQL_ROOT_PASSWORD='+password,'--env','MYSQL_USER=probe','--env','MYSQL_PASSWORD='+password,'--env','MYSQL_DATABASE='+database,image,'--default-time-zone=+00:00','--require-secure-transport=ON','--max-allowed-packet=134217728');created=true;
    const [container]=JSON.parse(await docker('inspect',name));
    assert.equal(container.Config.Labels['a4.owner'],id,'MySQL container belongs to this run');
    const [binding]=container.NetworkSettings.Ports['3306/tcp'];
    assert.equal(binding.HostIp,'127.0.0.1','MySQL must be published only on loopback');
    const port=binding.HostPort;
    let ready=false;for(let i=0;i<90;i++){try{await sql('SELECT 1');ready=true;break;}catch{}await new Promise(r=>setTimeout(r,1000));}assert.ok(ready,'MySQL ready');
    const schema=await readFile(path.join(root,'database/mysql/001-schema.sql'),'utf8');await sql(schema);
    report.schemaSha256=createHash('sha256').update(schema).digest('hex');report.server=await sql('SELECT VERSION()');
    check(await sql('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()')==='14','14 tables created from scratch');
    report.foreignKeys=Number(await sql('SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE()'));check(report.foreignKeys===18,'18 enforced foreign keys');
    await sql(`INSERT INTO companies(id,nombre,rut) VALUES('${A}','Empresa A ñ 漢字 😀','A'),('${B}','Empresa B','B');`);
    const users={};for(const [key,companies] of Object.entries({alice:[[A,'editor']],bob:[[B,'editor']],multi:[[A,'editor'],[B,'viewer']],viewer:[[A,'viewer']]})){
        const uid=randomUUID(),salt=randomBytes(16).toString('hex'),hash=pbkdf2Sync(password,Buffer.from(salt,'hex'),600000,32,'sha256').toString('hex');
        users[key]={email:key+'@a4.invalid',password,id:uid};
        await sql(`INSERT INTO auth_users(id,email,password_salt,password_hash) VALUES('${uid}','${users[key].email}','${salt}','${hash}');`+companies.map(([company,role])=>`INSERT INTO auth_memberships VALUES('${uid}','${company}','${role}');`).join('\n'));
    }
    await rejectSql(`INSERT INTO auth_memberships VALUES('${users.alice.id}','${randomUUID()}','viewer')`,1452);
    await rejectSql(`UPDATE auth_memberships SET role='admin' WHERE user_id='${users.alice.id}'`,3819);
    await rejectSql(`UPDATE auth_users SET email='Alice@a4.invalid' WHERE id='${users.alice.id}'`,3819);
    await rejectSql(`UPDATE auth_users SET active=2 WHERE id='${users.alice.id}'`,3819);
    await rejectSql(`DELETE FROM companies WHERE id='${A}'`,1451);
    const template=randomUUID();await sql(`INSERT INTO report_templates(id,company_id,nombre,template_json) VALUES('${template}','${A}','Prueba','{"amount":12345678901234567890.123456789}');`);
    check(await sql(`SELECT template_json FROM report_templates WHERE id='${template}'`)==='{"amount":12345678901234567890.123456789}','schema preserves JSON numeric text');
    await rejectSql(`UPDATE report_templates SET template_json='{' WHERE id='${template}'`,3819);
    await rejectSql(`UPDATE report_templates SET tags='{}' WHERE id='${template}'`,3819);
    await sql(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'probe'@'%'; GRANT SELECT ON ${database}.companies TO 'probe'@'%'; GRANT SELECT ON ${database}.auth_users TO 'probe'@'%'; GRANT SELECT ON ${database}.auth_memberships TO 'probe'@'%'; GRANT SELECT,INSERT,DELETE ON ${database}.auth_sessions TO 'probe'@'%'; GRANT SELECT,INSERT,UPDATE ON ${database}.auth_login_limits TO 'probe'@'%';`);
    await assert.rejects(sql('CREATE TABLE forbidden(id int)','probe'),/ERROR 1142/);check(true,'application user cannot create schema');
    await sql(await readFile(path.join(root,'database/mysql/002-json-precision.sql'),'utf8'));
    await sql(`GRANT SELECT ON ${database}.* TO 'probe'@'%'; GRANT INSERT,UPDATE,DELETE ON ${database}.report_templates TO 'probe'@'%';`);
    const ca=path.join(directory,'ca.pem');await writeFile(ca,await docker('exec',name,'cat','/var/lib/mysql/ca.pem'));
    const cs=`Server=127.0.0.1;Port=${port};Database=${database};User ID=probe;Password=${password};SslMode=VerifyCA;SslCa=${ca}`;
    await sql(`CREATE USER 'provisioner'@'%' IDENTIFIED BY '${password}'; GRANT SELECT ON ${database}.companies TO 'provisioner'@'%'; GRANT SELECT,INSERT,UPDATE,DELETE ON ${database}.auth_users TO 'provisioner'@'%'; GRANT SELECT,INSERT,UPDATE,DELETE ON ${database}.auth_memberships TO 'provisioner'@'%'; GRANT SELECT,INSERT,UPDATE,DELETE ON ${database}.auth_sessions TO 'provisioner'@'%';`);
    const provision=(body)=>new Promise((resolve,reject)=>{
        const child=spawn('dotnet',['backend-dotnet/tools/ProvisionMySqlUser/bin/Debug/net10.0/ProvisionMySqlUser.dll'],{cwd:root,windowsHide:true,env:{...process.env,AUTH_MYSQL_CONNECTION:cs.replace('User ID=probe','User ID=provisioner')},stdio:['pipe','pipe','pipe']});
        let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('close',code=>resolve({code,output}));child.stdin.end(JSON.stringify(body));
    });
    const createdUser=await provision({email:' provisioned@a4.invalid ',password,companies:[{id:A,role:'editor'}]});check(createdUser.code===0&&!createdUser.output.includes(password),'explicit administrator provisioning succeeds without exposing password');
    const invalidProvision=await provision({email:'provisioned@a4.invalid',password:password+'changed',companies:[{id:randomUUID(),role:'editor'}]});check(invalidProvision.code===1,'invalid provisioning rolls back');
    const urls=[await start(cs),await start(cs)];
    for(const url of urls)check((await fetch(url+'/health/ready')).status===200,'MySQL auth readiness over verified TLS');
    const provisioned=await login(urls[0],{email:'provisioned@a4.invalid',password});
    const reprovision=await provision({email:'provisioned@a4.invalid',password,companies:[{id:A,role:'viewer'}]});assert.equal(reprovision.code,0);
    await call(urls[1],provisioned,'GET','/api/auth/session',undefined,401);check(true,'successful reprovision revokes sessions and replaces memberships');
    const production=await start(cs,{ASPNETCORE_ENVIRONMENT:'Production',Auth__SecureCookie:'true'});
    const secure=await login(production,users.bob);check(/;\s*Secure/i.test(secure.header),'production session cookie is Secure');check((await fetch(production+'/reference/openapi.json')).status===404,'production reference remains hidden');
    await assert.rejects(start(cs.replace('SslMode=VerifyCA','SslMode=Required')),/API did not start/);check(true,'unverified TLS configuration fails startup');
    const badTls=await start(cs.replace(ca,path.join(directory,'missing-ca.pem')));
    check((await fetch(badTls+'/health/ready')).status===503,'bad trust anchor fails readiness');
    const failedLogin=await call(badTls,null,'POST','/api/auth/login',users.bob,500,{'X-CSRF-Token':'login'});
    check(!JSON.stringify(failedLogin).includes(password)&&!JSON.stringify(failedLogin).includes(database),'database failure response is sanitized');
    await call(urls[0],null,'GET','/api/auth/session',undefined,401);await call(urls[0],null,'GET','/api/templates',undefined,401);
    await call(urls[0],null,'POST','/api/auth/login',users.alice,403);
    await call(urls[0],null,'POST','/api/auth/login',{email:users.alice.email,password:'wrong'},401,{'X-CSRF-Token':'login'});
    await call(urls[0],null,'POST','/api/auth/login',{email:"' OR 1=1 --",password},401,{'X-CSRF-Token':'login'});
    let alice=await login(urls[0],{...users.alice,email:' ALICE@a4.invalid '});
    check(alice.session.company_id===A&&alice.session.role==='editor','normalized login with existing PBKDF2 format');
    check(alice.session.companies.length===1&&alice.session.companies[0].name==='Empresa A ñ 漢字 😀','company list stays tenant scoped and preserves Unicode');
    await call(urls[0],{cookie:'rd_session='+('g'.repeat(64)),session:{}},'GET','/api/auth/session',undefined,401);check(true,'malformed opaque token rejected');
    check(Math.abs(Date.parse(alice.session.expires_at)-Date.now()-8*3600000)<10000,'UTC expiry remains eight hours');
    await call(urls[1],alice,'GET','/api/auth/session');check(true,'session shared across MySQL replicas');
    const token=alice.cookie.split('=')[1];check(await sql(`SELECT COUNT(*) FROM auth_sessions WHERE token_hash='${createHash('sha256').update(token).digest('hex')}'`)==='1','only hashed session token stored');
    await call(urls[0],alice,'POST','/api/auth/company',{company_id:B},403);
    await call(urls[0],alice,'POST','/api/auth/logout',undefined,403,{'X-CSRF-Token':'invalid'});
    await call(urls[0],alice,'POST','/api/auth/logout',undefined,403,{'Sec-Fetch-Site':'cross-site'});
    await call(urls[0],alice,'GET','/api/templates',undefined,200);await call(urls[0],alice,'GET','/api/invoices',undefined,200);check(true,'business endpoints enabled with tenant-scoped persistence');
    const viewer=await login(urls[0],users.viewer);await call(urls[0],viewer,'POST','/api/templates',{},403);check(true,'viewer write remains forbidden before A4 gate');
    const multi=await login(urls[0],users.multi);
    const switched=await fetch(urls[1]+'/api/auth/company',{method:'POST',headers:{cookie:multi.cookie,'X-CSRF-Token':multi.session.csrf_token,'Content-Type':'application/json'},body:JSON.stringify({company_id:B})});assert.equal(switched.status,200);
    const newSession=await switched.json(),newCookie=switched.headers.get('set-cookie').split(';')[0];
    check(newSession.company_id===B&&newSession.role==='viewer'&&newSession.csrf_token!==multi.session.csrf_token&&newCookie!==multi.cookie,'company switch rotates token CSRF and role');
    await call(urls[0],multi,'GET','/api/auth/session',undefined,401);
    const active={cookie:newCookie,session:newSession};await call(urls[0],active,'POST','/api/auth/logout',undefined,204);await call(urls[1],active,'GET','/api/auth/session',undefined,401);
    report.browser=await checkBrowser({root,url:urls[0],user:users.multi,company:B,directory});check(report.browser.passed,'real web authentication and company selection');
    for(const [label,change,undo] of [
        ['expired',`UPDATE auth_sessions SET expires_at=UTC_TIMESTAMP(6)-INTERVAL 1 SECOND WHERE user_id='${users.alice.id}'`,''],
        ['disabled user',`UPDATE auth_users SET active=false WHERE id='${users.alice.id}'`,`UPDATE auth_users SET active=true WHERE id='${users.alice.id}'`],
        ['inactive company',`UPDATE companies SET activo=false WHERE id='${A}'`,`UPDATE companies SET activo=true WHERE id='${A}'`],
        ['revoked membership',`DELETE FROM auth_memberships WHERE user_id='${users.alice.id}'`,`INSERT INTO auth_memberships VALUES('${users.alice.id}','${A}','editor')`]
    ]){alice=await login(urls[0],users.alice);await sql(change);await call(urls[1],alice,'GET','/api/auth/session',undefined,401);if(undo)await sql(undo);check(true,label+' invalidates session');}
    await sql('DELETE FROM auth_login_limits');
    const attempts=await Promise.all(Array.from({length:20},(_,i)=>fetch(urls[i%2]+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':'login'},body:JSON.stringify({email:'rate@a4.invalid',password:'wrong'})}).then(r=>r.status)));
    check(attempts.filter(s=>s===401).length===10&&attempts.filter(s=>s===429).length===10,'concurrent rate limit exact across replicas: 10 allowed / 10 denied');
    await sql('UPDATE auth_login_limits SET window_start=UTC_TIMESTAMP(6)-INTERVAL 16 MINUTE');
    await call(urls[0],null,'POST','/api/auth/login',{email:'rate@a4.invalid',password:'wrong'},401,{'X-CSRF-Token':'login'});check(true,'expired rate window resets');
    const ipKey=createHash('sha256').update('ip:127.0.0.1').digest('hex');await sql(`UPDATE auth_login_limits SET attempts=99,window_start=UTC_TIMESTAMP(6) WHERE key_hash='${ipKey}'`);
    await call(urls[0],null,'POST','/api/auth/login',{email:'ip-one@a4.invalid',password:'wrong'},401,{'X-CSRF-Token':'login'});
    await call(urls[1],null,'POST','/api/auth/login',{email:'ip-two@a4.invalid',password:'wrong'},429,{'X-CSRF-Token':'login'});check(true,'IP limit is shared independently of email');
    await sql('DELETE FROM auth_login_limits');
    if(verify)await verify({urls,sql,users,directory,database,connection:cs});
    const before=await sql('SELECT COUNT(*) FROM auth_sessions');await sql(`DELETE FROM auth_users WHERE id='${users.alice.id}'`);
    check(await sql(`SELECT COUNT(*) FROM auth_sessions WHERE user_id='${users.alice.id}'`)==='0'&&Number(before)>0,'user deletion cascades sessions');
    // Basic backup stays local because it contains authentication material. Never version the dump.
    const backup=await docker('exec','-e','MYSQL_PWD='+password,name,'mysqldump','-uroot','--single-transaction','--no-tablespaces',database);
    await writeFile(path.join(directory,'isolated-backup.sql'),backup);report.backupSha256=createHash('sha256').update(backup).digest('hex');
    const restore=database+'_restore';await sql(`CREATE DATABASE ${restore}`);await sql(backup,'root',restore);
    for(const table of ['auth_users','auth_memberships','auth_sessions','auth_login_limits','companies','report_templates'])
        check(await sql(`SELECT COUNT(*) FROM ${table}`,'root',restore)===await sql(`SELECT COUNT(*) FROM ${table}`),'basic isolated backup restores '+table);
    report.passed=true;
}catch(e){report.error=String(e.message).replaceAll(password,'[redacted]');console.error(report.error);process.exitCode=1;}
finally {
    for(const [index,log] of logs.entries())await writeFile(path.join(directory,'api-'+index+'.log'),log());
    for(const child of children){if(child.exitCode===null&&child.signalCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}}
    if(created){try{assert.equal(await docker('inspect','--format','{{index .Config.Labels "a4.owner"}}',name),id);await docker('rm','--force','--volumes',name);report.cleanup='owned container and volumes removed';}catch{report.cleanup='failed';report.passed=false;process.exitCode=1;}}
    for(const [index,log] of logs.entries())await writeFile(path.join(directory,'api-'+index+'.log'),log());
    await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));
}
if(!report.passed)process.exitCode=1;

return report;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)await runMySql();
