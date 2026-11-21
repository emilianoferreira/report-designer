const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const mm = 96 / 25.4;
async function measured(frame) {
  return frame.locator('body').evaluate(body => [...body.querySelectorAll(':scope > .page')].map(page => {
    const origin = page.getBoundingClientRect();
    return [...page.querySelectorAll('[data-render-element],[data-render-generated],.ticket-detail-header,[data-render-page-label]')]
      .map(node => { const r=node.getBoundingClientRect();return {
        id:node.getAttribute('data-render-element') || node.getAttribute('data-render-generated') || node.className,
        text:node.textContent, source:node.getAttribute('data-render-source'),
        box:[r.left-origin.left,r.top-origin.top,r.width,r.height]
      }; });
  }));
}
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  fs.mkdirSync('tmp/wysiwyg-blocks',{recursive:true});
  const results=[];
  try {
    for(const scenario of ['a4','ticket-80','row-limit','height-limit','pagination-pending']) {
      const row={...JSON.parse(fs.readFileSync('e2e/stage0/fixtures/report-a4.json')),id:'blocks'};
      const t=row.template_json.template;
      const text=structuredClone(t.sections.header.elements[0]);
      function element(id,x,y,width,height,content) {
        return {...structuredClone(text),id,name:id,content,position:{x,y},size:{width,height},
          style:{...structuredClone(text.style),font:{family:'Arial',size:10,weight:'normal',style:'normal',color:'#000000'}}};
      }
      t.page.margins={left:7,right:4,top:9,bottom:6};
      t.sections.header.height=40;t.sections.detail.height=8;t.sections.footer.height=20;
      const fiscal=!['a4','ticket-80'].includes(scenario);
      t.sections.header.elements=[element('inside',10,10,30,8,'OK')];
      if(!fiscal) {
        t.sections.header.elements.push(element('clipped',50,10,10,3,'Texto largo que excede claramente la caja'),
          element('outside',-4,25,25,8,'Borde'));
        t.sections.footer.elements=[];
      } else {
        t.sections.footer.elements=[element('closing',10,5,60,8,'Cierre exclusivo')];
        t.compliance={schemaVersion:'1.0',cfeType:111,medium:'sheet',issuerRegime:'general'};
        if(scenario==='height-limit') {
          t.page.height=100;t.page.margins={left:5,right:5,top:5,bottom:5};
          t.sections.header.height=30;t.sections.footer.height=40;
        } else t.sections.detail.maxRowsPerPage=2;
        if(scenario==='pagination-pending')t.sections.detail.groupBy='Articulo.Codigo';
      }
      if(scenario==='ticket-80')Object.assign(t.page,{paperType:'ticket-80',width:80,dynamicHeight:true});
      const initial=JSON.stringify(row);
      const page=await browser.newPage({viewport:{width:1600,height:1100}});
      const errors=[];let writes=0;
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>{
        const url=new URL(route.request().url()),path=url.pathname;
        if(url.hostname!=='review.test')return route.abort();
        if(path==='/api/auth/session')return route.fulfill({json:{user:{id:'review',email:'review@example.test'},company_id:row.company_id,role:'editor',csrf_token:'token',companies:[]}});
        if(path==='/api/templates'&&route.request().method()==='GET')return route.fulfill({json:[row]});
        if(path.startsWith('/api/')){if(route.request().method()!=='GET')writes++;return route.fulfill({status:404,json:{}});}
        const name=path.split('/').pop(),asset=/^[\w.-]+\.(js|css|ico)$/.test(name)?name:'index.html';
        return route.fulfill({body:fs.readFileSync('dist/zureo-report-designer/browser/'+asset),
          contentType:asset.endsWith('.js')?'application/javascript':asset.endsWith('.css')?'text/css':'text/html'});
      });
      await page.goto('http://review.test/designer/blocks');
      const canvas=page.frameLocator('iframe[title="Lienzo con datos"]');
      const selector=page.locator('app-design-validation').getByLabel('Escenario de validación',{exact:true});
      const counts=fiscal?[5]:[0,1,5];
      for(const count of counts) {
        if(count===0)await page.locator('app-design-validation input[type="file"]').setInputFiles({
          name:'empty.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({invoice:{},company:{},invoiceLines:[]}))
        });
        else await selector.selectOption(fiscal?'fiscal-multi':count===1?'single':'multi');
        await expect(canvas.locator(scenario==='ticket-80'?'.ticket-item':'.detail-table tbody tr')).toHaveCount(count);
        await expect(page.locator('[data-surface-inspection]')).toBeVisible();
        const status=page.locator('[data-pagination-status]');
        if(scenario==='row-limit')await expect(status).toContainText('3 hojas');
        if(scenario==='height-limit')await expect(status).toContainText('2 hojas');
        if(scenario==='pagination-pending')await expect(status).toContainText('Paginación pendiente');
        if(!fiscal) {
          await expect(page.locator('[data-warning-inspect][data-warning-element="clipped"]')).toContainText('Contenido recortado');
          await expect(page.locator('[data-warning-inspect][data-warning-element="outside"]')).toContainText('Fuera del área imprimible');
          await expect(page.locator('[data-warning-inspect][data-warning-element="inside"]')).toHaveCount(0);
        }
        await expect(canvas.locator('.page').first()).toBeVisible();
        const designed=await measured(canvas);
        await expect(page.locator('[data-sheet-boundary]')).toHaveCount(designed.length);
        await expect(page.locator('[data-printable-page]')).toHaveCount(designed.length);
        for(let index=0;index<designed.length;index++) {
          const printable=await page.locator('[data-printable-page="'+(index+1)+'"]').evaluate(node=>{
            const r=node.getBoundingClientRect(),p=node.closest('.canvas-page'),o=p.getBoundingClientRect();
            const scale=new DOMMatrixReadOnly(getComputedStyle(p).transform).a;
            return [(r.left-o.left)/scale,(r.top-o.top)/scale,r.width/scale,r.height/scale];
          });
          const sheet=await canvas.locator('.page').nth(index).evaluate(node=>{
            const r=node.getBoundingClientRect(),o=node.ownerDocument.querySelector('.page').getBoundingClientRect();
            return [r.left-o.left,r.top-o.top,r.width,r.height];
          });
          const physicalHeight=t.page.dynamicHeight?sheet[3]:t.page.height*mm;
          const expected=[sheet[0]+t.page.margins.left*mm,sheet[1]+t.page.margins.top*mm,
            sheet[2]-(t.page.margins.left+t.page.margins.right)*mm,
            physicalHeight-(t.page.margins.top+t.page.margins.bottom)*mm];
          printable.forEach((value,axis)=>assert.ok(Math.abs(value-expected[axis])<=.25));
        }
        const paths=designed.flat().filter(node=>node.source).map(node=>node.source);
        assert.equal(new Set(paths).size,count,'Rows lost or duplicated');
        // Inspect generated content after selecting an editable element.
        if(count>0) {
          await page.locator('[data-element-id="inside"]').click();
          await page.locator('[data-surface-inspection] summary').filter({hasText:'Contenido generado'}).click();
          const inspect=page.locator('[data-generated-inspect]').filter({hasText:scenario==='ticket-80'?'Artículo ·':'Tabla de artículos'}).first();
          await inspect.click();
          await expect(page.locator('[data-inspected-content]')).toContainText('Generado automáticamente');
          await expect(page.locator('.element-wrapper.selected')).toHaveCount(0);
          await page.keyboard.press('Delete');
          await expect(page.getByRole('button',{name:'Guardar',exact:true})).toBeDisabled();
          const key=await inspect.getAttribute('data-block-key');
          const outline=page.locator('[data-generated-outline="'+key+'"]');
          await expect(outline).toBeVisible();
          const observed=await outline.evaluate(node=>{
            const r=node.getBoundingClientRect(),p=node.closest('.canvas-page'),o=p.getBoundingClientRect();
            const scale=new DOMMatrixReadOnly(getComputedStyle(p).transform).a;
            return [(r.left-o.left)/scale,(r.top-o.top)/scale,r.width/scale,r.height/scale];
          });
          const actual=await canvas.locator(scenario==='ticket-80'?'.ticket-item':'.detail-table').first().evaluate(node=>{
            const r=node.getBoundingClientRect(),o=node.ownerDocument.querySelector('.page').getBoundingClientRect();
            return [r.left-o.left,r.top-o.top,r.width,r.height];
          });
          observed.forEach((value,index)=>assert.ok(Math.abs(value-actual[index])<=.25));
          const rect=await outline.boundingBox();
          await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();
          await page.mouse.move(rect.x+rect.width/2+25,rect.y+rect.height/2+10);await page.mouse.up();
          await expect(page.getByRole('button',{name:'Guardar',exact:true})).toBeDisabled();
        }
        if(count===0) {
          await page.locator('[data-warning-inspect][data-warning-element="clipped"]').click();
          await expect(page.locator('[data-element-id="clipped"]')).toHaveClass(/selected/);
          await expect(page.getByRole('button',{name:'Guardar',exact:true})).toBeDisabled();
        }
        await page.screenshot({path:'tmp/wysiwyg-blocks/'+scenario+'-'+count+'-canvas.png'});
        await page.getByRole('button',{name:'Vista Previa',exact:true}).click();
        const preview=page.frameLocator('iframe[title="Vista previa"]');
        await expect(preview.locator(scenario==='ticket-80'?'.ticket-item':'.detail-table tbody tr')).toHaveCount(count);
        if(scenario==='row-limit')await expect(preview.locator('[data-render-page]')).toHaveCount(3);
        if(scenario==='height-limit')await expect(preview.locator('[data-render-page]')).toHaveCount(2);
        await expect(preview.locator('.page').first()).toBeVisible();
        const printed=await measured(preview);
        assert.equal(designed.length,printed.length);
        designed.forEach((nodes,p)=>{
          assert.equal(nodes.length,printed[p].length);
          nodes.forEach((node,i)=>{
            assert.equal(node.id,printed[p][i].id);assert.equal(node.text,printed[p][i].text);
            node.box.forEach((value,axis)=>assert.ok(Math.abs(value-printed[p][i].box[axis])<=.25));
          });
        });
        if(fiscal&&scenario!=='pagination-pending') {
          await expect(preview.getByText('Cierre exclusivo',{exact:true})).toHaveCount(1);
          await expect(preview.locator('.page').last()).toContainText('Cierre exclusivo');
          const labels=await preview.locator('[data-render-page-label]').allTextContents();
          assert.deepEqual(labels,printed.map((_,i)=>'Página '+(i+1)+' de '+printed.length));
          const html=await preview.locator('html').evaluate(node=>node.outerHTML);
          const pdfPage=await browser.newPage();await pdfPage.setContent(html);
          const pdf=await pdfPage.pdf({preferCSSPageSize:true});
          assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,printed.length);
          await pdfPage.close();
        }
        await page.screenshot({path:'tmp/wysiwyg-blocks/'+scenario+'-'+count+'-preview.png'});
        results.push({scenario,count,pages:printed.length,rows:paths,boxes:designed});
        await page.getByRole('button',{name:'Diseño',exact:true}).click();
      }
      assert.equal(JSON.stringify(row),initial);assert.equal(writes,0);assert.deepEqual(errors,[]);
      await page.close();
    }
    fs.writeFileSync('tmp/wysiwyg-blocks/measurements.json',JSON.stringify(results,null,2));
    console.log('PASS generated content, clipping, printable bounds, zero/one/five articles, pagination and PDF.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
