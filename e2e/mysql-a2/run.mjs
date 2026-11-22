import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {runIsolatedApi} from '../price-labels/concurrency-api.mjs';
import {A,B,login,call} from '../stage8/check-security.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const execute=promisify(execFile);
const command=async(bin,args,env=process.env)=>(await execute(bin,args,{cwd:root,env,windowsHide:true,maxBuffer:4*1024*1024})).stdout.trim();
const hash=value=>createHash('sha256').update(value).digest('hex');
assert.equal(await command('git',['branch','--show-current']),'codex/mysql-migration');
const directory=path.join(root,'e2e/test-results/mysql-a2-'+randomUUID());await mkdir(directory,{recursive:true});
console.log('A2 evidence: '+directory);
const reference=await readFile(new URL('./postgres-reference.sql',import.meta.url),'utf8');
assert.equal(reference.replaceAll('\r\n','\n'),(await readFile(path.join(root,'database/003-view-invoice-data.sql'),'utf8')).replaceAll('\r\n','\n'),'recoverable PostgreSQL reference is unchanged');
const report={passed:false,reference:await command('git',['rev-parse','HEAD']),main:await command('git',['rev-parse','main']),oracleSha256:hash(reference),renders:[]};
const bundle=await build({entryPoints:[path.join(root,'e2e/mysql-a1/renderer-entry.ts')],bundle:true,write:false,platform:'browser',format:'iife',tsconfig:path.join(root,'tsconfig.json')});
try {
    await runIsolatedApi({verify:async({urls,db,users,resultsDir})=>{
        report.securityEvidence=resultsDir;
        const owner=randomUUID();await db.query('CREATE TABLE a2_test_owner(owner text NOT NULL)');await db.query('INSERT INTO a2_test_owner VALUES($1)',[owner]);
        const cases=[];
        const defaultZone=(await db.query('SHOW TimeZone')).rows[0].TimeZone;
        report.defaultTimeZone=defaultZone;
        const add=(name,id,company=A,zone=defaultZone,denied=false)=>cases.push({name,id,company,zone,denied});
        const seeds=(await db.query("SELECT id,company_id FROM invoices WHERE id::text LIKE 'f1000000-%' ORDER BY id")).rows;
        for(const [i,row] of seeds.entries())add('seed-'+(i+1),row.id,row.company_id);
        const original=seeds[1].id;
        async function clone(name,changes={}) {
            const id=randomUUID();
            await db.query('INSERT INTO invoices SELECT (jsonb_populate_record(NULL::invoices,to_jsonb(i)||$2::jsonb)).* FROM invoices i WHERE id=$1',[original,JSON.stringify({id,...changes})]);
            add(name,id);return id;
        }
        await clone('empty');
        const nullable=await clone('nullable',{contact_id:null,branch_id:null,serie:null,subtotal:null,total:null,tipo_cambio:null,porcentaje_desc_global:null,monto_dto_global:null,redondeo:null,is_imp_incluidos:null,is_consumo_final:null,comentario:null,direccion_factura:null,cae_identificador:null,cae_desde:null,cae_hasta:null,cae_fecha_vto:null,cfe_cod_seguridad:null,cfe_adenda:null});
        await db.query("INSERT INTO invoice_lines(invoice_id,linea_nro,articulo_codigo,articulo_nombre,cantidad,precio_unitario,precio_unitario_neto,descuento,subtotal) VALUES($1,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL)",[nullable]);
        await db.query("INSERT INTO invoice_taxes(invoice_id,nombre,valor) VALUES($1,'IVA nulo',NULL)",[nullable]);
        const rich=await clone('precision-unicode',{comentario:'ñ 漢字 😀 <script> & "',direccion_factura:'',cae_fecha_vto:'2028-02-29'});
        await db.query("UPDATE invoices SET fecha='2026-04-01T00:04:05.123987+05:45',subtotal=1234567890123.45,total=-1234567890123.45,tipo_cambio=999999.1234,porcentaje_desc_global=-1,redondeo=-0.01 WHERE id=$1",[rich]);
        await db.query("INSERT INTO invoice_lines(invoice_id,linea_nro,articulo_codigo,articulo_nombre,cantidad,precio_unitario,precio_unitario_neto,descuento,subtotal) VALUES($1,9,'Z','última 😀',-12345678901.1234,1234567890123.45,0,-1,-12),($1,2,'A','primera',0,0,0,0,0),($1,2,'B','empate sin desempate',1,2,3,4,5)",[rich]);
        await db.query("INSERT INTO invoice_taxes(invoice_id,nombre,valor) VALUES($1,'Z',-12.34),($1,'A',0),($1,'A',0)",[rich]);
        add('offset-utc',rich,A,'UTC');add('offset-montevideo',rich,A,'America/Montevideo');add('offset-kathmandu',rich,A,'Asia/Kathmandu');
        await clone('zero-flags',{redondeo:0,porcentaje_desc_global:0});
        add('foreign-company',original,B,'UTC',true);add('missing',randomUUID(),A,'UTC',true);
        for(const [table,column] of [['contacts','contact_id'],['branches','branch_id'],['invoice_types','type_id']]) {
            const foreign=(await db.query(`SELECT id FROM ${table} WHERE company_id=$1 LIMIT 1`,[B])).rows[0].id;
            const id=await clone('foreign-'+table,{[column]:foreign});cases.at(-1).denied=true;
        }
        // Extension JSON never passes through a JavaScript number during the precision comparison.
        await db.query(`UPDATE companies SET parametros='{"unknown":{"number":12345678901234567890.123456789,"array":[null,false,"ñ",""]},"numberAsString":"001.00"}'::jsonb WHERE id=$1`,[A]);
        await db.query('UPDATE companies SET nombre_comercial=NULL,direccion=NULL,ciudad=NULL,logo_url=NULL,parametros=NULL WHERE id=$1',[B]);
        await db.query('UPDATE invoice_types SET opera_contado=NULL,es_cfe=NULL WHERE company_id=$1',[B]);
        await writeFile(path.join(directory,'cases.json'),JSON.stringify(cases,null,2));
        const p=db.connectionParameters;
        const env={...process.env,A2_CONNECTION:`Host=127.0.0.1;Port=${p.port};Database=${p.database};Username=${p.user};Password=${p.password}`,A2_PORT:String(p.port),A2_OWNER:owner,A2_DIRECTORY:directory};
        console.log(await command('dotnet',['run','--no-build','--project','backend-dotnet/probes/InvoiceDataStage2/InvoiceDataStage2.csproj'],env));
        report.comparison=JSON.parse(await readFile(path.join(directory,'comparison.json'),'utf8'));assert.equal(report.comparison.passed,true);
        await db.query('DELETE FROM auth_login_limits');const identity=await login(urls[1],users.alice);
        for(const test of cases.filter(c=>c.denied&&c.company===A))await call(urls[1],identity,'GET',`/api/invoices/${test.id}/data`,undefined,404);
        const browser=await chromium.launch({...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{channel:'chrome'}),headless:true});
        try {
            for(const test of cases.filter(c=>['seed-2','nullable','precision-unicode'].includes(c.name))) {
                const api=await call(urls[1],identity,'GET',`/api/invoices/${test.id}/data`);
                const candidate=JSON.parse(await readFile(path.join(directory,test.name+'.candidate.json'),'utf8'));
                assert.deepEqual(candidate,api,'candidate equals unchanged authenticated endpoint');
                for(const fixtureName of ['report-a4','report-ticket-80']) {
                    const fixture=JSON.parse(await readFile(path.join(root,'e2e/stage0/fixtures',fixtureName+'.json'),'utf8'));
                    const rendered=[];
                    for(const [kind,data] of [['api',api],['candidate',candidate]]) {
                        const page=await browser.newPage({viewport:{width:1100,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
                        await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
                        const result=await page.evaluate(({template,data})=>window.renderInvoice(template,data),{template:fixture.template_json.template,data});
                        await page.setContent(result.html,{waitUntil:'load'});const text=await page.locator('body').innerText();
                        const prefix=test.name+'-'+fixtureName+'-'+kind;
                        await writeFile(path.join(directory,prefix+'.html'),result.html);
                        const png=await page.screenshot({path:path.join(directory,prefix+'.png'),fullPage:true});
                        const pdf=await page.pdf({path:path.join(directory,prefix+'.pdf'),preferCSSPageSize:true,printBackground:true});
                        assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.deepEqual(errors,[]);
                        const pages=(pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length;assert.ok(pages>0);
                        rendered.push({html:hash(result.html),preview:hash(result.preview),text:hash(text),png:hash(png),pdfPages:pages});await page.close();
                    }
                    assert.deepEqual(rendered[0],rendered[1],'renderer outputs match without PDF binary equality');
                    report.renders.push({case:test.name,fixture:fixtureName,...rendered[0]});
                }
            }
        }finally{await browser.close();}
        report.passed=true;
    }});
}finally{await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));}
assert.equal(report.passed,true,'A2 must finish all comparisons and render checks');
