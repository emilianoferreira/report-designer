const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const assert = require('node:assert/strict');

async function geometry(frame) {
  return frame.locator('body').evaluate(body => {
    const pages = [...body.querySelectorAll(':scope > .page')];
    return pages.map(page => {
      const origin = page.getBoundingClientRect();
      return [...page.querySelectorAll('.section,[data-render-element],table,tr,.ticket-item')].map(node => {
        const rect = node.getBoundingClientRect();
        return { key: node.getAttribute('data-render-element') || node.className || node.tagName,
          box: [rect.left - origin.left, rect.top - origin.top, rect.width, rect.height] };
      });
    });
  });
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  fs.mkdirSync('tmp/wysiwyg', { recursive: true });
  const results = [];
  try {
    for (const [paper, width, height, dynamicHeight] of [
      ['a4',210,297,false], ['a5',148,210,false], ['ticket-58',58,200,true],
      ['ticket-80',80,200,true], ['custom',175,240,false], ['historical-a4',210,297,false], ['historical-ticket-80',80,200,true], ['fiscal-pages',210,297,false]
    ]) {
      const row = { ...JSON.parse(fs.readFileSync('e2e/stage0/fixtures/'+(paper === 'historical-ticket-80' ? 'report-ticket-80' : 'report-a4')+'.json')), id: 'geometry' };
      const template = row.template_json.template;
      if (!paper.startsWith('historical')) Object.assign(template.page, { paperType: paper, width, height, dynamicHeight,
        margins: { left: 7, right: 4, top: 9, bottom: 6 } });
      if (!paper.startsWith('historical')) template.sections.detail.height = 8;
      if (paper === 'fiscal-pages') {
        template.sections.detail.maxRowsPerPage = 2;
        template.compliance = { schemaVersion:'1.0', cfeType:111, medium:'sheet', issuerRegime:'general' };
      }
      const original = JSON.stringify(row);
      const page = await browser.newPage({ viewport: { width:1600, height:1100 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        const url = new URL(route.request().url()), pathname = url.pathname;
        if (url.hostname !== 'review.test') return route.abort();
        if (pathname === '/api/auth/session') return route.fulfill({ json: {
          user:{id:'review',email:'review@example.test'}, company_id:row.company_id,
          role:'editor',csrf_token:'token',companies:[] } });
        if (pathname === '/api/templates') return route.fulfill({ json:[row] });
        if (pathname.startsWith('/api/')) return route.fulfill({status:404,json:{}});
        const name = pathname.split('/').pop();
        const asset = /^[\w.-]+\.(js|css|ico)$/.test(name) ? name : 'index.html';
        return route.fulfill({body:fs.readFileSync('dist/zureo-report-designer/browser/'+asset),
          contentType:asset.endsWith('.js')?'application/javascript':asset.endsWith('.css')?'text/css':'text/html'});
      });
      await page.goto('http://review.test/designer/geometry');
      await page.locator('app-design-validation').getByLabel('Escenario de validación', {exact:true}).selectOption(paper === 'fiscal-pages' ? 'fiscal-multi' : 'multi');
      const canvas = page.frameLocator('iframe[title="Lienzo con datos"]');
      await expect(canvas.locator(dynamicHeight ? '.ticket-item' : '.detail-table tbody tr')).toHaveCount(5);
      await expect(page.locator('.section-area').first()).toBeVisible();
      const designed = await geometry(canvas);
      const id = template.sections.header.elements[0].id;
      const left = template.page.margins.left, top = template.page.margins.top;
      const anchor = designed[0].find(item => item.key === id).box;
      assert.ok(Math.abs(anchor[0] - (left + 1.25)*96/25.4) < .25);
      assert.ok(Math.abs(anchor[1] - (top + 2.75)*96/25.4) < .25);
      for (let i=0;i<4;i++) await page.getByTitle('Alejar la vista del lienzo').click();
      assert.deepEqual(await geometry(canvas), designed);
      const hitBox = await page.locator('[data-element-id="'+id+'"]').evaluate(node => {
        const sheet = node.closest('.canvas-page');
        const box = node.getBoundingClientRect(), origin = sheet.getBoundingClientRect();
        const scale = new DOMMatrixReadOnly(getComputedStyle(sheet).transform).a;
        return [(box.left-origin.left)/scale,(box.top-origin.top)/scale,box.width/scale,box.height/scale];
      });
      hitBox.forEach((value,axis) => assert.ok(Math.abs(value-anchor[axis]) < .25,
        'Selection box differs from rendered element'));

      await expect(page.getByRole('button',{name:'Guardar',exact:true})).toBeDisabled();
      await page.screenshot({path:'tmp/wysiwyg/'+paper+'-canvas.png'});
      await page.getByRole('button',{name:'Vista Previa',exact:true}).click();
      const preview = page.frameLocator('iframe[title="Vista previa"]');
      await expect(preview.locator(dynamicHeight ? '.ticket-item' : '.detail-table tbody tr')).toHaveCount(5);
      await expect(page.locator('[data-print-preparation]')).toBeAttached();
      const printed = await geometry(preview);
      if (paper === 'fiscal-pages') assert.equal(printed.length,3);
      await page.getByText('Descargar o copiar',{exact:true}).click();
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button',{name:'HTML render',exact:true}).first().click();
      const resolved = fs.readFileSync(await (await downloadPromise).path(),'utf8');
      const exportedPage = await browser.newPage();
      await exportedPage.setContent(resolved);
      assert.deepEqual(await geometry(exportedPage),printed);
      await exportedPage.close();
      if (paper.startsWith('historical')) {
        const filePromise = page.waitForEvent('download');
        await page.getByRole('button',{name:'HTML z-code',exact:true}).first().click();
        const exported = fs.readFileSync(await (await filePromise).path());
        const hash = require('node:crypto').createHash('sha256').update(exported).digest('hex');
        const baselinePath='e2e/wysiwyg/baseline.json';
        const baseline=JSON.parse(fs.readFileSync(baselinePath));
        if (process.argv.includes('--record')) {
          baseline.exports[paper]=hash;
          fs.writeFileSync(baselinePath,JSON.stringify(baseline,null,2)+'\n');
        } else assert.equal(hash,baseline.exports[paper], 'Historical z-code changed');
      }
      assert.equal(printed.length, designed.length);
      designed.forEach((nodes,p) => {
        assert.equal(nodes.length,printed[p].length);
        nodes.forEach((node,i) => {
          assert.equal(node.key,printed[p][i].key);
          node.box.forEach((value,axis) => assert.ok(Math.abs(value-printed[p][i].box[axis]) <= .25,
            paper+' '+node.key+' axis '+axis));
        });
      });
      await page.screenshot({path:'tmp/wysiwyg/'+paper+'-preview.png'});
      assert.equal(JSON.stringify(row),original);
      assert.deepEqual(errors,[]);
      results.push({paper, anchor, pages:designed.length, measuredNodes:designed.flat().length, tolerancePx:.25});
      await page.close();
    }
    fs.writeFileSync('tmp/wysiwyg/measurements.json',JSON.stringify(results,null,2));
    console.log('PASS: canvas/preview DOM geometry, known coordinates, margins, zoom and read-only opening.',results);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
