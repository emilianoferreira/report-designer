import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {runIsolatedApi} from '../price-labels/concurrency-api.mjs';
import {runMySql} from '../mysql-a4/run.mjs';
import {A,B,login,call} from '../stage8/check-security.mjs';

export async function runA5({verify}={}) {
const root=fileURLToPath(new URL('../../',import.meta.url));
const directory=path.join(root,'e2e/test-results/mysql-a5-'+randomUUID());await mkdir(directory,{recursive:true});console.log('A5 evidence: '+directory);
const hash=x=>createHash('sha256').update(x).digest('hex');
const report={passed:false,checks:[],renders:[]};
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
const literal=value=>value===null?'NULL':value===''?"''":`CONVERT(0x${Buffer.from(String(value),'utf8').toString('hex')} USING utf8mb4)`;
const bundle=await build({entryPoints:[path.join(root,'e2e/mysql-a1/renderer-entry.ts')],bundle:true,write:false,platform:'browser',format:'iife',tsconfig:path.join(root,'tsconfig.json')});
try {
await runIsolatedApi({verify:async pg=>{
    report.postgresSecurity=pg.resultsDir;
    const mysql=await runMySql({verify:async my=>{
        report.mysqlEvidence=my.directory;
        // Copy only synthetic business fixtures, with every scalar exported as text to avoid JS rounding.
        const tables=['companies','branches','contacts','currencies','invoice_types','articles','invoices','invoice_lines','invoice_taxes','report_templates'];
        await my.sql('DELETE FROM report_templates');
        for(const table of tables) {
            const columns=(await pg.db.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[table])).rows;
            const projection=columns.map(c=>`${c.data_type==='timestamp with time zone'?`to_char(${c.column_name} AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS.US')`:c.data_type==='ARRAY'?`to_json(${c.column_name})::text`:c.data_type==='boolean'?`CASE WHEN ${c.column_name} IS NULL THEN NULL WHEN ${c.column_name} THEN '1' ELSE '0' END`:`${c.column_name}::text`} AS "${c.column_name}"`).join(',');
            const rows=(await pg.db.query(`SELECT ${projection} FROM ${table} ORDER BY id`)).rows;
            for(const row of rows)await my.sql(`INSERT INTO ${table} (${columns.map(c=>'`'+c.column_name+'`').join(',')}) VALUES(${columns.map(c=>literal(row[c.column_name])).join(',')}) ON DUPLICATE KEY UPDATE ${columns.filter(c=>c.column_name!=='id').map(c=>'`'+c.column_name+'`=VALUES(`'+c.column_name+'`)').join(',')}`);
            check(Number(await my.sql(`SELECT COUNT(*) FROM ${table}`))===rows.length,'fixture transfer '+table);
        }
        await pg.db.query('DELETE FROM auth_login_limits');await my.sql('DELETE FROM auth_login_limits');
        const p=await login(pg.urls[1],pg.users.alice),m=await login(my.urls[0],my.users.alice),other=await login(my.urls[1],my.users.bob),viewer=await login(my.urls[1],my.users.viewer);
        for(const route of ['/api/templates','/api/invoices'])assert.deepEqual(await call(my.urls[0],m,'GET',route),await call(pg.urls[1],p,'GET',route));check(true,'seed lists match PostgreSQL including dates decimal strings and tags');
        const invoices=(await pg.db.query('SELECT id,company_id FROM invoices ORDER BY id')).rows;
        const pb=await login(pg.urls[1],pg.users.bob);
        for(const invoice of invoices){const isA=invoice.company_id===A;const a=await call(pg.urls[1],isA?p:pb,'GET',`/api/invoices/${invoice.id}/data`);const b=await call(my.urls[0],isA?m:other,'GET',`/api/invoices/${invoice.id}/data`);assert.deepEqual(b,a);await writeFile(path.join(directory,invoice.id+'.json'),JSON.stringify({postgres:a,mysql:b},null,2));check(true,'InvoiceData parity '+invoice.id);}
        const fixture=JSON.parse(await readFile(path.join(root,'e2e/stage0/fixtures/report-a4.json'),'utf8'));
        for(const name of ['price-label','report-ticket-80']) {
            const item=JSON.parse(await readFile(path.join(root,'e2e/stage0/fixtures',name+'.json'),'utf8'));
            const stored=await call(my.urls[0],m,'POST','/api/templates',{nombre:name,template_json:item.template_json},201);
            const saved=await call(my.urls[1],m,'PUT',`/api/templates/${stored.id}/design`,{template_json:item.template_json},200,{'If-Match':'"1"'});
            assert.deepEqual(saved.template_json,item.template_json);assert.deepEqual((await call(my.urls[0],m,'GET',`/api/templates/${stored.id}`)).template_json,item.template_json);
            await call(my.urls[0],m,'DELETE',`/api/templates/${stored.id}`,undefined,200,{'If-Match':'"2"'});check(true,'real save/reload '+name);
        }
        const payload={nombre:'A5 ñ',descripcion:'',template_json:fixture.template_json};
        for(const [url,identity] of [[pg.urls[1],p],[my.urls[0],m]])await call(url,identity,'POST','/api/templates',{...payload,nombre:'invalid\u0000'},500);
        check(true,'creation rejects zero characters consistently');
        const normalized=row=>{const {id,created_at,updated_at,...rest}=row;return rest;};
        let left=await call(pg.urls[1],p,'POST','/api/templates',payload,201),right=await call(my.urls[0],m,'POST','/api/templates',payload,201);
        assert.deepEqual(normalized(right),normalized(left));const route='/api/templates/'+right.id,pgRoute='/api/templates/'+left.id;
        for(const fields of [{nombre:'Actualizado',descripcion:null,autor:'ñ',tags:['ñ',null,'ñ',''],estado:null},{descripcion:{long:1,a:'ñ'},tags:[1,true,{long:1,a:'ñ'}]},{version:10},{version:null},{version:0},{ignored:'property'},{}]) {
            left=await call(pg.urls[1],p,'PUT',pgRoute,fields);right=await call(my.urls[0],m,'PUT',route,fields);assert.deepEqual(normalized(right),normalized(left));
        }check(true,'updates preserve nullable fields tags unknown fields and legacy version rules');
        const missingDesign=await call(my.urls[0],m,'PUT',route+'/design',{});check(!Object.hasOwn(missingDesign,'template_json'),'missing design is omitted in save response');right=await call(my.urls[0],m,'GET',route);
        const noOp=await call(my.urls[0],m,'PUT',route,{version:right.version-1});assert.deepEqual(noOp,right);check(true,'legacy no-op retains timestamp and revision');
        await call(my.urls[0],m,'PUT',route,{ignored:'\u0000'},500);await call(pg.urls[1],p,'PUT',pgRoute,{ignored:'\u0000'},500);
        await call(my.urls[0],m,'PUT',route,{tags:[['nested']]},500);await call(pg.urls[1],p,'PUT',pgRoute,{tags:[['nested']]},500);check(true,'historical invalid text and multidimensional tags stay rejected');
        await call(my.urls[0],m,'PUT',route+'/design',{template_json:null},500);assert.deepEqual(await call(my.urls[0],m,'GET',route),right);check(true,'invalid design rolls back');
        const raw='{"template_json":{"exact":12345678901234567890.123456789,"huge":1e400,"key":1,"key":2,"array":[null,"ñ",false]}}';
        async function rawSave(url,identity,target){const r=await fetch(url+target+'/design',{method:'PUT',headers:{cookie:identity.cookie,'X-CSRF-Token':identity.session.csrf_token,'Content-Type':'application/json'},body:raw});assert.equal(r.status,200);return r.text();}
        const postgresRaw=await rawSave(pg.urls[1],p,pgRoute),mysqlRaw=await rawSave(my.urls[0],m,route);await writeFile(path.join(directory,'numeric-postgres.json'),postgresRaw);await writeFile(path.join(directory,'numeric-mysql.json'),mysqlRaw);
        check(postgresRaw.includes('12345678901234567890.123456789')&&postgresRaw.includes('1'+'0'.repeat(400))&&mysqlRaw.includes('12345678901234567890123456789e-9')&&mysqlRaw.includes('1e400')&&!mysqlRaw.includes('"key":1'),'exact numeric value, huge exponent and last duplicate key preserved');
        right=await call(my.urls[0],m,'GET',route);
        const race=await Promise.all(my.urls.map((url,i)=>fetch(url+route,{method:'PUT',headers:{cookie:m.cookie,'X-CSRF-Token':m.session.csrf_token,'Content-Type':'application/json','If-Match':JSON.stringify(String(right.version))},body:JSON.stringify({nombre:'race-'+i,version:900})})));
        assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);const current=await call(my.urls[0],m,'GET',route);assert.equal(current.version,right.version+1);
        await call(my.urls[1],m,'DELETE',route,undefined,409,{'If-Match':JSON.stringify(String(right.version))});
        await call(my.urls[0],m,'PUT',route+'/design',{template_json:{}},409,{'If-Match':JSON.stringify(String(right.version))});
        await call(my.urls[0],m,'PUT',route,{},400,{'If-Match':'bad'});check(true,'cross-replica If-Match one winner stale saves and deletes rejected');
        const legacy=await Promise.all(my.urls.map((url,i)=>call(url,m,'PUT',route,{nombre:'legacy-'+i})));assert.deepEqual(legacy.map(x=>x.version).sort((a,b)=>a-b),[current.version+1,current.version+2]);check(true,'legacy concurrent writes serialize and each advances revision');
        const before=await call(my.urls[0],m,'GET',route);
        for(const [method,suffix,body] of [['GET','',undefined],['PUT','',{nombre:'denied'}],['PUT','/design',{template_json:{}}],['DELETE','',undefined],['POST','/duplicate',{}]])await call(my.urls[1],other,method,route+suffix,body,404);
        await call(my.urls[0],viewer,'PUT',route,{},403);await call(my.urls[0],m,'PUT',route,{company_id:B},403);await call(my.urls[0],m,'GET','/api/templates?companyId='+B,undefined,403);
        assert.deepEqual(await call(my.urls[0],m,'GET',route),before);check(true,'tenant and viewer denials leave row unchanged');
        const copy=await call(my.urls[1],m,'POST',route+'/duplicate',{},201);assert.equal(copy.version,1);assert.deepEqual(copy.template_json,before.template_json);assert.equal(copy.nombre,before.nombre+' (copia)');check(true,'duplicate preserves content and resets revision');
        await call(my.urls[0],m,'PUT',route,{based_on:copy.id});await call(my.urls[0],m,'DELETE','/api/templates/'+copy.id,undefined,500);check(true,'referenced parent deletion remains protected by FK');
        await call(my.urls[0],m,'PUT',route,{based_on:null});await call(my.urls[0],m,'DELETE','/api/templates/'+copy.id,undefined,200,{'If-Match':'"1"'});
        const latest=await call(my.urls[0],m,'GET',route);await call(my.urls[1],m,'DELETE',route,undefined,200,{'If-Match':JSON.stringify(String(latest.version))});await call(my.urls[0],m,'GET',route,undefined,404);
        const deletionRace=await call(my.urls[0],m,'POST','/api/templates',payload,201);
        const competing=await Promise.all([['PUT',my.urls[0]],['DELETE',my.urls[1]]].map(([method,url])=>fetch(url+'/api/templates/'+deletionRace.id,{method,headers:{cookie:m.cookie,'X-CSRF-Token':m.session.csrf_token,'Content-Type':'application/json','If-Match':'"1"'},...(method==='PUT'?{body:'{"nombre":"race-save"}'}:{})})));
        const statuses=competing.map(r=>r.status).sort();check(JSON.stringify(statuses)==='[200,409]'||JSON.stringify(statuses)==='[200,404]','save/delete race commits exactly one operation');
        const owned=invoices.find(x=>x.company_id===A).id;
        for(const [column,table] of [['contact_id','contacts'],['branch_id','branches'],['type_id','invoice_types']]) {
            const old=await my.sql(`SELECT ${column} FROM invoices WHERE id='${owned}'`),foreign=await my.sql(`SELECT id FROM ${table} WHERE company_id='${B}' LIMIT 1`);
            await my.sql(`UPDATE invoices SET ${column}='${foreign}' WHERE id='${owned}'`);await call(my.urls[0],m,'GET',`/api/invoices/${owned}/data`,undefined,404);await my.sql(`UPDATE invoices SET ${column}=${old==='NULL'?'NULL':"'"+old+"'"} WHERE id='${owned}'`);
        }check(true,'foreign invoice relationships cannot leak data');
        for(const target of ['/api/templates/not-a-uuid','/api/invoices/not-a-uuid/data'])await call(my.urls[0],m,'GET',target,undefined,500);
        const browser=await chromium.launch({channel:'chrome',headless:true});
        try {
            const invoice=invoices.find(x=>x.id.endsWith('0002')).id;
            for(const name of ['report-a4','report-ticket-80']) {
                const mold=JSON.parse(await readFile(path.join(root,'e2e/stage0/fixtures',name+'.json'),'utf8'));const evidence=[];
                for(const [engine,url,identity] of [['postgres',pg.urls[1],p],['mysql',my.urls[0],m]]) {
                    const data=await call(url,identity,'GET',`/api/invoices/${invoice}/data`);const page=await browser.newPage({viewport:{width:1100,height:900}});
                    await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
                    const result=await page.evaluate(({template,data})=>window.renderInvoice(template,data),{template:mold.template_json.template,data});
                    await page.setContent(result.html);const prefix=name+'-'+engine;await writeFile(path.join(directory,prefix+'.html'),result.html);
                    const png=await page.screenshot({path:path.join(directory,prefix+'.png'),fullPage:true});const pdf=await page.pdf({path:path.join(directory,prefix+'.pdf'),preferCSSPageSize:true,printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
                    evidence.push({html:hash(result.html),png:hash(png),pages:(pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length});await page.close();
                }assert.deepEqual(evidence[0],evidence[1]);report.renders.push({fixture:name,...evidence[0]});
            }
        }finally{await browser.close();}
        const edge=invoices.find(x=>x.id.endsWith('0002')).id;
        await pg.db.query("UPDATE invoices SET fecha='2026-04-01T00:04:05.123987+05:45',cae_fecha_vto='2028-02-29',contact_id=NULL,branch_id=NULL,total=NULL,redondeo=NULL,porcentaje_desc_global=NULL,is_consumo_final=NULL,is_imp_incluidos=NULL WHERE id=$1",[edge]);
        await my.sql(`UPDATE invoices SET fecha='2026-03-31 18:19:05.123987',cae_fecha_vto='2028-02-29',contact_id=NULL,branch_id=NULL,total=NULL,redondeo=NULL,porcentaje_desc_global=NULL,is_consumo_final=NULL,is_imp_incluidos=NULL WHERE id='${edge}'`);
        const referenceEdge=await call(pg.urls[1],p,'GET',`/api/invoices/${edge}/data`),mysqlEdge=await call(my.urls[0],m,'GET',`/api/invoices/${edge}/data`);assert.deepEqual(mysqlEdge,referenceEdge);
        await writeFile(path.join(directory,'invoice-edge.json'),JSON.stringify({postgres:referenceEdge,mysql:mysqlEdge},null,2));check(true,'invoice microseconds offset leap-day nullable amounts flags and relations match');
        if(verify)report.functional=await verify({mysql:my,postgres:pg,directory});
    }});
    assert.equal(mysql.passed,true,'MySQL suite completed');
    report.passed=true;
}});
if(process.exitCode)report.passed=false;
}finally{await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));}
assert.equal(report.passed,true,'A5 completed');
return {report,directory};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)await runA5();
