import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { login, call } from '../stage8/check-security.mjs';
import { runIsolatedApi } from '../price-labels/concurrency-api.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'e2e/test-results/mysql-a1-' + randomUUID());
await mkdir(output, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, {cwd:root,encoding:'utf8',windowsHide:true}).trim();
const inventory = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, {withFileTypes:true}).catch(e => { if(e.code==='ENOENT')return [];throw e; })) {
    const file = path.join(directory,entry.name);
    if(entry.isDirectory()) await inspect(file);
    else if(entry.isFile()) { const bytes=await readFile(file); inventory.push({path:path.relative(root,file),bytes:bytes.length,sha256:hash(bytes),classification:entry.name==='packages.lock.json'?'dependency resolution evidence, not validated':'generated artifact; retained without deletion'}); }
  }
}
await inspect(path.join(root,'backend-dotnet/probes'));
await writeFile(path.join(output,'inventory.json'),JSON.stringify(inventory,null,2));
const report={passed:false,reference:git('rev-parse','HEAD'),main:git('rev-parse','main'),branch:git('branch','--show-current'),cases:[]};
assert.equal(report.branch,'codex/mysql-migration');
console.log('A1 evidence: '+output);
const bundle=await build({entryPoints:[path.join(root,'e2e/mysql-a1/renderer-entry.ts')],bundle:true,write:false,platform:'browser',format:'iife',tsconfig:path.join(root,'tsconfig.json')});
try {
  await runIsolatedApi({verify:async ({urls,db,users,resultsDir}) => {
    report.securityEvidence = resultsDir;
    report.database = (await db.query('SELECT current_database() AS name, version() AS version')).rows[0];
    const browser=await chromium.launch({...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{channel:'chrome'}),headless:true});
    try {
      for(const [index,url] of urls.entries()) {
        await db.query('DELETE FROM auth_login_limits');
        const identity=await login(url,users.alice);
        const foreign=await login(url,users.bob);
        const invoice='f1000000-0000-0000-0000-000000000002';
        await call(url,null,'GET',`/api/invoices/${invoice}/data`,undefined,401);
        await call(url,foreign,'GET',`/api/invoices/${invoice}/data`,undefined,404);
        // Real HTTP response is passed unchanged into the real browser renderer.
        const data=await call(url,identity,'GET',`/api/invoices/${invoice}/data`);
        const oracle=(await db.query('SELECT build_invoice_data($1) AS data',[invoice])).rows[0].data;
        assert.deepEqual(data,oracle);
        assert.ok(data.invoiceLines.length>0);
        const dataFile=`${index}-invoice.json`;
        await writeFile(path.join(output,dataFile),JSON.stringify(data,null,2));
        for(const name of ['report-a4','report-ticket-80']) {
          const fixture=JSON.parse(await readFile(path.join(root,'e2e/stage0/fixtures',name+'.json'),'utf8'));
          const page=await browser.newPage({viewport:{width:1100,height:900}});
          const errors=[];page.on('pageerror',e=>errors.push(e.message));
          await page.goto('about:blank');
          await page.addScriptTag({content:bundle.outputFiles[0].text});
          const rendered=await page.evaluate(({template,data})=>window.renderInvoice(template,data),{template:fixture.template_json.template,data});
          assert.ok(rendered.html.length>1000);
          await page.setContent(rendered.html,{waitUntil:'load'});
          const text=await page.locator('body').innerText();
          assert.ok(text.includes(data.company.Nombre),'company from real API rendered');
          assert.ok(text.includes(data.invoiceLines[0].Articulo.Nombre),'invoice line from real API rendered');
          assert.ok(text.includes(rendered.formattedTotal),'API total rendered');
          assert.deepEqual(errors,[]);
          const prefix=`${index}-${name}`;
          await writeFile(path.join(output,prefix+'.html'),rendered.html);
          await writeFile(path.join(output,prefix+'-render-evidence.json'),JSON.stringify(rendered.evidence,null,2));
          await page.screenshot({path:path.join(output,prefix+'.png'),fullPage:true});
          const pdf=await page.pdf({path:path.join(output,prefix+'.pdf'),preferCSSPageSize:true,printBackground:true});
          assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
          const pdfPages=(pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length;
          assert.ok(pdfPages>0,'PDF has pages');
          report.cases.push({backend:index===0?'nestjs':'dotnet',fixture:name,route:`/api/invoices/${invoice}/data`,status:200,input:dataFile,inputSha256:hash(JSON.stringify(data)),htmlSha256:hash(rendered.html),textSha256:hash(text),pdfBytes:pdf.length,pdfPages,checks:['SQL function parity','unauthenticated 401','foreign company 404','API company rendered','API line rendered','API total rendered','no browser errors','PDF generated with pages']});
          await page.close();
        }
      }
      for(const name of ['report-a4','report-ticket-80']) {
        const pair=report.cases.filter(x=>x.fixture===name);
        assert.equal(pair[0].inputSha256,pair[1].inputSha256);
        assert.equal(pair[0].htmlSha256,pair[1].htmlSha256);
        assert.equal(pair[0].textSha256,pair[1].textSha256);
        assert.equal(pair[0].pdfPages,pair[1].pdfPages);
      }
      report.passed=true;
    } finally {await browser.close();}
  }});
} finally {
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
if(!report.passed)process.exitCode=1;
