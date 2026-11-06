const assert = require('node:assert/strict');
const { expect } = require('@playwright/test');
module.exports = async (page, newTemplate) => {
  const button = name => page.getByRole('button', {name,exact:true});
  const tab = name => page.locator('app-price-label-properties').getByRole('button',{name,exact:true});
  const field = async (name,value) => { const input=page.getByLabel(name,{exact:true}); await input.fill(value); await input.press('Tab'); };
  const read = el => { const css=getComputedStyle(el), rect=el.getBoundingClientRect(); return {background:css.backgroundColor, radius:parseFloat(css.borderRadius), border:parseFloat(css.borderLeftWidth), overflow:css.overflow, font:parseFloat(css.fontSize), whiteSpace:css.whiteSpace, text:el.innerText, width:rect.width, height:rect.height}; };
  await newTemplate(); await button('1:1').click();
  await page.locator('.image-content').click(); await tab('Estilo').click();
  await page.getByLabel('Fondo',{exact:true}).fill('#ff0000'); await page.getByLabel('Fondo',{exact:true}).dispatchEvent('change');
  await page.getByLabel('Borde',{exact:true}).fill('#00ff00'); await page.getByLabel('Borde',{exact:true}).dispatchEvent('change');
  await field('Grosor','0.5'); await field('Radio','4'); await field('Opacidad','0.5');
  const canvasImage=await page.locator('.image-content').evaluate(read);
  assert.equal(canvasImage.background,'rgb(255, 0, 0)'); assert.equal(canvasImage.overflow,'hidden');
  await expect(page.locator('.resize-handle')).toHaveCount(8);
  assert.equal(await page.locator('.image-content').evaluate(el=>getComputedStyle(el.parentElement).overflow),'visible');
  await page.locator('.text-content').click(); await tab('Datos').click();
  await page.getByRole('combobox',{name:/^Campo de datos/}).selectOption(''); await field('Texto fijo','UNO\nDOS');
  const canvasText=await page.locator('.text-content').evaluate(read);
  assert.equal(canvasText.text,'UNO\nDOS'); assert.equal(canvasText.whiteSpace,'pre-wrap');
  await button('Vista previa').click(); const frame=page.frameLocator('iframe');
  await expect(button('Imprimir')).toBeEnabled();
  const printedImage=await frame.locator('.label-image').first().evaluate(read);
  for (const key of ['width','height','radius','border']) assert.ok(Math.abs(canvasImage[key]-printedImage[key])<0.1,key);
  assert.equal(printedImage.background,canvasImage.background); assert.equal(printedImage.overflow,canvasImage.overflow);
  assert.equal(await frame.locator('.label-image').first().evaluate(el=>getComputedStyle(el).opacity),'0.5');
  const printedText=await frame.locator('.label-text').first().evaluate(read);
  assert.equal(printedText.text,canvasText.text); assert.ok(Math.abs(printedText.font-canvasText.font)<0.01);
  const downloadPromise=page.waitForEvent('download'); await button('Exportar HTML').click(); const download=await downloadPromise;
  const html=require('node:fs').readFileSync(await download.path(),'utf8');
  assert.ok(html.includes('white-space: pre-wrap;')); assert.ok(html.includes('UNO\nDOS')); assert.ok(html.includes('border-radius:4mm'));
  for (const fit of ['contain','cover','stretch']) {
    await button('Diseño').click(); await page.locator('.image-content').click(); await tab('Datos').click();
    await page.getByRole('combobox',{name:/^Ajuste/}).selectOption(fit);
    const editorFit=await page.locator('.image-content img').evaluate(el=>getComputedStyle(el).objectFit);
    const editor=await page.locator('.image-content').evaluate(read);
    // Recreated canvas defaults to 300%; physical presentation must scale uniformly.
    assert.ok(Math.abs(editor.radius/3-printedImage.radius)<0.01);
    // Computed borders are rounded to device pixels; verify the authored physical width.
    const border=await page.locator('.image-content').evaluate(el=>parseFloat(el.style.borderWidth));
    assert.ok(Math.abs(border/3-0.5*96/25.4)<0.01);
    await button('Vista previa').click(); await expect(button('Imprimir')).toBeEnabled();
    assert.equal(await frame.locator('.label-image img').first().evaluate(el=>getComputedStyle(el).objectFit),editorFit);
  }
  await button('Diseño').click();
  await page.locator('.text-content').click(); await tab('Datos').click();
  await field('Texto fijo',Array(20).fill('Línea').join('\n'));
  await button('Vista previa').click();
  await expect(page.getByRole('status').filter({hasText:'Texto recortado'})).toBeVisible();
  await button('Diseño').click();
  console.log('PASS: shared image background/border/radius/opacity, selection handles, multiline text, physical zoom, image fits and exported HTML.');
};
