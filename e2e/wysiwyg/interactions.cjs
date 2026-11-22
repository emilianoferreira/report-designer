const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const ratio = 96 / 25.4;
const near = (actual, expected, tolerance=.25) => assert.ok(Math.abs(actual-expected)<=tolerance,
  actual+' differs from '+expected);
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  fs.mkdirSync('tmp/wysiwyg-interactions',{recursive:true});
  try {
    for (const zoom of [.6,1,1.4]) {
      const row={...JSON.parse(fs.readFileSync('e2e/stage0/fixtures/report-a4.json')),id:'interaction'};
      const template=row.template_json.template;
      template.page.margins={left:7,right:4,top:9,bottom:6};
      const text=structuredClone(template.sections.header.elements[0]);
      const element=(id,x,y,locked=false)=>({...structuredClone(text),id,name:id,content:id,
        position:{x,y},size:{width:20,height:8},locked});
      template.sections.header.elements=[element('moving',10,10),element('target',45,25),element('locked',95,10,true)];
      template.sections.detail.height=8;
      template.sections.detail.elements=[element('detail-moving',70,1)];
      template.sections.footer.elements=[element('closing',10,5)];
      const page=await browser.newPage({viewport:{width:1700,height:1300}});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>{
        const url=new URL(route.request().url()),p=url.pathname;
        if(url.hostname!=='review.test')return route.abort();
        if(p==='/api/auth/session')return route.fulfill({json:{user:{id:'review',email:'review@example.test'},company_id:row.company_id,role:'editor',csrf_token:'token',companies:[]}});
        if(p==='/api/templates')return route.fulfill({json:[row]});
        if(p.startsWith('/api/'))return route.fulfill({status:404,json:{}});
        const name=p.split('/').pop(),asset=/^[\w.-]+\.(js|css|ico)$/.test(name)?name:'index.html';
        return route.fulfill({body:fs.readFileSync('dist/zureo-report-designer/browser/'+asset),
          contentType:asset.endsWith('.js')?'application/javascript':asset.endsWith('.css')?'text/css':'text/html'});
      });
      await page.goto('http://review.test/designer/interaction');
      await page.locator('app-design-validation').getByLabel('Escenario de validación',{exact:true}).selectOption('multi');
      const canvas=page.frameLocator('iframe[title="Lienzo con datos"]');
      const hit=id=>page.locator('[data-element-id="'+id+'"]');
      const box=async id=>canvas.locator('[data-render-element="'+id+'"]').last().evaluate(node=>{
        const rect=node.getBoundingClientRect();
        return {x:rect.x,y:rect.y,w:rect.width,h:rect.height};
      });
      const ready=async()=>{await expect(hit('moving')).toBeVisible(); await expect(canvas.locator('.detail-table tbody tr')).toHaveCount(5);};
      await ready();
      await expect(page.getByRole('button',{name:'Guardar',exact:true})).toBeDisabled();
      const steps=Math.round(Math.abs(zoom-1)*10);
      for(let i=0;i<steps;i++)await page.getByTitle(zoom<1?'Alejar la vista del lienzo':'Acercar la vista del lienzo').click();
      await page.getByTitle('Ajustar a la grilla de 5mm').click();
      await page.getByTitle('Ajustar a otros elementos').click();
      const drag=async(id,dx,dy,handle)=>{
        await ready();
        const node=handle?hit(id).locator('.resize-handle.'+handle):hit(id);
        const rect=await node.boundingBox();
        await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
        await page.mouse.down();
        await page.mouse.move(rect.x+rect.width/2+dx*ratio*zoom,rect.y+rect.height/2+dy*ratio*zoom,{steps:8});
        await page.waitForTimeout(60);
        const during=await box(id);
        await page.mouse.up();
        await ready();
        await expect.poll(async()=> (await box(id)).x).toBeCloseTo(during.x,0);
        const after=await box(id);
        for(const key of ['x','y','w','h'])near(after[key],during[key],.25);
        return after;
      };
      const cancelledBefore=await box('moving');
      const cancelledRect=await hit('moving').boundingBox();
      await page.mouse.move(cancelledRect.x+cancelledRect.width/2,cancelledRect.y+cancelledRect.height/2);
      await page.mouse.down();
      await page.mouse.move(cancelledRect.x+cancelledRect.width/2+20,cancelledRect.y+cancelledRect.height/2+10,{steps:4});
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await ready();
      await expect.poll(()=>box('moving')).toEqual(cancelledBefore);
      await expect(page.getByRole('button',{name:'Guardar',exact:true})).toBeDisabled();
      const initial=await box('moving');
      const moved=await drag('moving',5,3);
      near(moved.x-initial.x,5*ratio,1/zoom);near(moved.y-initial.y,3*ratio,1/zoom);
      const beforeResize=await box('moving');
      const resized=await drag('moving',3,0,'w');
      near(resized.x+resized.w,beforeResize.x+beforeResize.w);
      near(resized.w,beforeResize.w-3*ratio,1/zoom);
      const beforeCoordinates = await box('moving');
      await hit('moving').click();
      await page.getByLabel('X (mm)',{exact:true}).fill('12.3');
      await page.getByLabel('X (mm)',{exact:true}).blur();
      await expect.poll(async()=> (await box('moving')).x).toBeCloseTo((7+12.3)*ratio,0);
      await page.getByLabel('Y (mm)',{exact:true}).fill('14.7');
      await page.getByLabel('Y (mm)',{exact:true}).blur();
      await expect.poll(async()=> (await box('moving')).y).toBeCloseTo((9+14.7)*ratio,0);
      await page.getByRole('button',{name:'Comparar impresión',exact:true}).click();
      await expect(hit('moving')).toBeHidden();
      await page.getByRole('button',{name:'Comparar impresión',exact:true}).click();
      await expect(hit('moving')).toHaveClass(/selected/);
      await page.getByRole('button',{name:'Comparar impresión',exact:true}).focus();
      await page.keyboard.press('Control+z');
      await ready();
      await expect.poll(async()=> (await box('moving')).y).toBeCloseTo(beforeCoordinates.y,0);
      await page.keyboard.press('Control+Shift+z');
      await ready();
      await expect.poll(async()=> (await box('moving')).y).toBeCloseTo((9+14.7)*ratio,0);
      // Grid resize snaps only the moving edge.
      const gridBefore=await box('moving');
      await page.getByTitle('Ajustar a la grilla de 5mm').click();
      const gridAfter=await drag('moving',2,0,'e');
      near(gridAfter.x,gridBefore.x);
      near(gridAfter.x+gridAfter.w,37*ratio);
      await page.getByTitle('Ajustar a la grilla de 5mm').click();
      await page.getByRole('button',{name:'Comparar impresión',exact:true}).focus();
      await page.keyboard.press('Control+z');
      await expect.poll(async()=> (await box('moving')).w).toBeCloseTo(gridBefore.w,0);
      await ready();
      // Snap and its guide use the destination section's page origin.
      await page.getByTitle('Ajustar a otros elementos').click();
      const snapRect=await hit('moving').boundingBox();
      await page.mouse.move(snapRect.x+snapRect.width/2,snapRect.y+snapRect.height/2);await page.mouse.down();
      await page.mouse.move(snapRect.x+snapRect.width/2+32.4*ratio*zoom,snapRect.y+snapRect.height/2,{steps:8});
      await expect(page.locator('.smart-guide-line.vertical').first()).toBeVisible();
      const guide=await page.locator('.smart-guide-line.vertical').first().evaluate(node=>{
        const sheet=node.closest('.canvas-page');
        return (node.getBoundingClientRect().left-sheet.getBoundingClientRect().left) /
          new DOMMatrixReadOnly(getComputedStyle(sheet).transform).a;
      });
      near(guide,52*ratio);
      await page.mouse.up();await ready();
      near((await box('moving')).x,52*ratio);
      await page.getByTitle('Ajustar a otros elementos').click();
      // Move a selection as a rigid group.
      await hit('target').click({modifiers:['Shift']});
      await ready();
      await expect(hit('target')).toHaveClass(/selected/);
      await expect(hit('moving')).toHaveClass(/selected/);
      const groupBefore=[await box('moving'),await box('target')];
      await drag('moving',3,2);
      const groupAfter=[await box('moving'),await box('target')];
      near(groupAfter[1].x-groupAfter[0].x,groupBefore[1].x-groupBefore[0].x);
      near(groupAfter[1].y-groupAfter[0].y,groupBefore[1].y-groupBefore[0].y);
      await drag('moving',200,0);
      const clampedGroup=[await box('moving'),await box('target')];
      near(clampedGroup[1].x-clampedGroup[0].x,groupBefore[1].x-groupBefore[0].x);
      near(Math.max(...clampedGroup.map(rect=>rect.x+rect.w)),(210-4)*ratio);
      await hit('moving').click();
      // Locked elements remain selectable and cannot be moved.
      const lockedBefore=await box('locked');
      const lockedRect=await hit('locked').boundingBox();
      await page.mouse.move(lockedRect.x+5,lockedRect.y+5);await page.mouse.down();
      await page.mouse.move(lockedRect.x+40,lockedRect.y+30);await page.mouse.up();
      assert.deepEqual(await box('locked'),lockedBefore);
      await expect(page.getByLabel('X (mm)',{exact:true})).toBeDisabled();
      // Transfer into the measured footer after the detail has grown.
      await hit('moving').click();
      const footer=await page.locator('.section-area').nth(2).boundingBox();
      const movingRect=await hit('moving').boundingBox();
      const deltaY=(footer.y+5*ratio*zoom-movingRect.y)/(ratio*zoom);
      await drag('moving',0,deltaY);
      await expect(hit('moving').locator('xpath=ancestor::div[contains(@class,"section-area")]').locator('.section-label')).toHaveText(/Pie/);
      const detailRect=await hit('detail-moving').boundingBox();
      const footerRect=await page.locator('.section-area').nth(2).boundingBox();
      await drag('detail-moving',0,(footerRect.y+15*ratio*zoom-detailRect.y)/(ratio*zoom));
      await expect(hit('detail-moving').locator('xpath=ancestor::div[contains(@class,"section-area")]').locator('.section-label')).toHaveText(/Pie/);
      const final=await box('moving');
      await page.screenshot({path:'tmp/wysiwyg-interactions/'+zoom+'-canvas.png'});
      await page.getByRole('button',{name:'Vista Previa',exact:true}).click();
      const preview=page.frameLocator('iframe[title="Vista previa"]');
      await expect(preview.locator('[data-render-element="moving"]')).toBeAttached();
      const previewBox=await preview.locator('[data-render-element="moving"]').evaluate(node=>{
        const r=node.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};
      });
      for(const key of ['x','y','w','h'])near(final[key],previewBox[key]);
      await page.screenshot({path:'tmp/wysiwyg-interactions/'+zoom+'-preview.png'});
      assert.deepEqual(errors,[]);
      console.log('PASS interactions at zoom',zoom,final);
      await page.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
