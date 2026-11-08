import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';

// Real compiled Angular and real API on one local origin. No mocked auth responses.
export async function checkBrowser({root,url,user,company,directory}) {
    const server=http.createServer(async(req,res)=>{
        if(req.url.startsWith('/api/')) {
            const upstream=http.request(new URL(req.url,url),{method:req.method,headers:{...req.headers,host:new URL(url).host}},response=>{
                res.writeHead(response.statusCode,response.headers);response.pipe(res);
            });
            upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);return;
        }
        const name=path.basename(new URL(req.url,'http://local').pathname);
        const asset=/^[a-zA-Z0-9._-]+\.(js|css|ico|png|svg)$/.test(name)?name:'index.html';
        try{res.setHeader('Content-Type',asset.endsWith('.js')?'application/javascript':asset.endsWith('.css')?'text/css':'text/html');res.end(await readFile(path.join(root,'dist/zureo-report-designer/browser',asset)));}
        catch{res.writeHead(404);res.end();}
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    let browser;
    try {
        browser=await chromium.launch({channel:'chrome',headless:true});
        const page=await browser.newPage({viewport:{width:1200,height:850}});page.on('dialog',dialog=>dialog.accept());
        const origin='http://127.0.0.1:'+server.address().port;
        await page.goto(origin+'/login');
        await page.getByLabel('Correo electrónico').fill(user.email);await page.getByLabel('Contraseña').fill(user.password);
        await page.getByRole('button',{name:'Ingresar',exact:true}).click();
        await expect(page.getByRole('navigation',{name:'Sesión'})).toBeVisible();
        const before=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()));
        await page.getByLabel('Empresa activa').selectOption(company);
        await expect(page.getByLabel('Empresa activa')).toHaveValue(company);await expect(page.getByText('Solo lectura',{exact:true})).toBeVisible();
        const after=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()));
        assert.equal(after.company_id,company);assert.equal(after.role,'viewer');assert.notEqual(after.csrf_token,before.csrf_token);
        const status=await page.evaluate(()=>fetch('/api/templates').then(r=>r.status));assert.equal(status,200);
        await page.screenshot({path:path.join(directory,'authenticated-company.png'),fullPage:true});
        await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
        await expect(page.getByRole('heading',{name:'Iniciar sesión',exact:true})).toBeVisible();
        assert.equal(await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.status)),401);
        return {passed:true,checks:['Angular login via real API','company switch and viewer role','CSRF rotation','tenant templates endpoint responds 200','logout invalidates browser session']};
    }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
