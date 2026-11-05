const assert = require('node:assert/strict');
const { expect } = require('@playwright/test');

module.exports = async function precisionTests(page, newTemplate, openSettings) {
  const button = name => page.getByRole('button', { name, exact: true });
  const barcode = page.locator('.barcode-content');
  const geometry = () => barcode.evaluate(el => {
    const box = el.parentElement;
    return { x: parseFloat(box.style.left), y: parseFloat(box.style.top), w: parseFloat(box.style.width), h: parseFloat(box.style.height) };
  });
  const waitGeometry = async expected => {
    await page.waitForFunction(expected => {
      const box = document.querySelector('.barcode-content').parentElement;
      const actual = { x: parseFloat(box.style.left), y: parseFloat(box.style.top), w: parseFloat(box.style.width), h: parseFloat(box.style.height) };
      return Object.keys(expected).every(key => Math.abs(actual[key] - expected[key]) < 0.05);
    }, expected);
  };
  async function toggle(name, value) {
    if ((await button(name).getAttribute('aria-pressed') === 'true') !== value) await button(name).click();
    await expect(button(name)).toHaveAttribute('aria-pressed', String(value));
  }
  async function drag(dx, dy, release = true, handle) {
    const rect = await (handle ? page.locator('.label-element.selected .resize-handle.' + handle) : barcode).boundingBox();
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 6 });
    if (release) await page.mouse.up();
  }
  await newTemplate();
  await page.waitForFunction(() => document.querySelectorAll('.label-element').length === 4);
  assert.equal(await button('Deshacer').isDisabled(), true);
  await toggle('Snap', false); await toggle('Elem', false);
  await barcode.click();
  const original = await geometry();
  await drag(23, 0);
  await page.waitForFunction(() => !document.querySelector('[aria-label="Deshacer"]').disabled);
  const moved = await geometry();
  assert.ok(moved.x > original.x + 20);
  await page.keyboard.press('Control+z'); await waitGeometry(original);
  assert.equal(await button('Deshacer').isDisabled(), true); // one action for six moves
  await page.keyboard.press('Control+Shift+Z'); await waitGeometry(moved);
  await barcode.click(); // selection/no-op gesture must not enter history
  await button('Deshacer').click(); await waitGeometry(original);
  await page.keyboard.press('Control+y'); await waitGeometry(moved);
  await drag(15, 0, false); await page.keyboard.press('Escape'); await page.mouse.up();
  await waitGeometry(moved);
  await button('Deshacer').click(); await waitGeometry(original);
  await button('Rehacer').click(); await waitGeometry(moved);

  await barcode.click();
  await drag(12, 6, true, 'se');
  await page.waitForFunction(w => parseFloat(document.querySelector('.barcode-content').parentElement.style.width) > w, moved.w);
  const resized = await geometry();
  await button('Deshacer').click(); await waitGeometry(moved);
  await button('Rehacer').click(); await waitGeometry(resized);
  await button('Deshacer').click(); await waitGeometry(moved);
  await barcode.click(); await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(x => parseFloat(document.querySelector('.barcode-content').parentElement.style.left) < x, moved.x);
  assert.equal(await button('Rehacer').isDisabled(), true); // branching invalidates redo

  await newTemplate();
  await barcode.click();
  await toggle('Snap', true); await toggle('Elem', false);
  await toggle('Grilla', false); // snapping must work even with hidden grid
  const zoom = 3, mm = 96 / 25.4 * zoom;
  await drag(2 * mm, 0);
  await waitGeometry({ x: 10 * mm, y: 20 * mm });
  await button('Deshacer').click(); await waitGeometry(original);
  await toggle('Snap', false); await toggle('Elem', true);
  await drag(0.8 * mm, 0, false);
  await page.locator('.alignment-guide').first().waitFor();
  await page.screenshot({ path: 'tmp/labels-alignment.png' });
  await page.mouse.up();
  await waitGeometry({ x: 8 * mm }); // aligns to logo center at x=8 mm
  await expect(page.locator('.alignment-guide')).toHaveCount(0);
  await toggle('Grilla', true);
  await button('1:1').click();
  await page.waitForFunction(() => document.querySelector('.zoom-label').textContent.includes('100%'));
  assert.ok(Math.abs(await page.locator('.grid-overlay').evaluate(el => parseFloat(el.style.backgroundSize)) - 5 * 96 / 25.4) < 0.01);
  assert.ok(Math.abs(await page.locator('.horizontal-ruler .ruler-mark').nth(2).evaluate(el => parseFloat(el.style.left)) - 10 * 96 / 25.4) < 0.01);
  await toggle('Reglas', false); assert.equal(await page.locator('.ruler').count(), 0);
  await toggle('Reglas', true);

  // Editing fields keeps native Delete/arrow/undo behavior.
  await barcode.click();
  await page.locator('app-price-label-properties').getByRole('button', { name: 'General', exact: true }).click();
  const input = page.locator('app-price-label-properties').getByRole('textbox', { name: 'Nombre', exact: true });
  await input.focus(); await input.press('Control+a'); await input.press('Delete');
  assert.equal(await barcode.count(), 1);
  await input.fill('Código editado'); await input.press('Tab');
  await barcode.click(); await page.keyboard.press('Control+d');
  await page.waitForFunction(() => document.querySelectorAll('.barcode-content').length === 2);
  await page.keyboard.press('Delete');
  await page.waitForFunction(() => document.querySelectorAll('.barcode-content').length === 1);
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.querySelectorAll('.barcode-content').length === 2);
  await newTemplate(); await expect(button('Deshacer')).toBeDisabled();

  // Page settings also participate in history.
  await openSettings();
  const width = page.locator('#print-settings').getByLabel('Ancho', { exact: true });
  const beforeTyping = await geometry();
  await width.fill(''); await width.pressSequentially('60');
  assert.deepEqual(await geometry(), beforeTyping); // intermediate digits must not clamp the elements
  await width.press('Tab');
  await expect(button('Deshacer')).toBeEnabled();
  await button('Deshacer').click();
  await expect(width).toHaveValue('50');
  await expect(button('Deshacer')).toBeDisabled(); // one completed field edit
  const rows = page.getByLabel('Filas', { exact: true });
  await rows.fill('7'); await rows.press('Tab');
  await button('Deshacer').click();
  await page.waitForFunction(() => [...document.querySelectorAll('#print-settings input')].some(el => el.value === '8'));
  assert.equal(await rows.inputValue(), '8');
  await button('Rehacer').click();
  await page.waitForFunction(() => [...document.querySelectorAll('#print-settings input')].some(el => el.value === '7'));
  await button('Configuración de impresión').click();
  // Saving keeps history and the server-issued identity on every restored snapshot.
  const save = page.waitForResponse(r => r.request().method() === 'POST');
  await page.keyboard.press('Control+s'); await save;
  await page.waitForFunction(() => !document.querySelector('button.primary').disabled);
  const id = await page.locator('.template-select').inputValue();
  await button('Deshacer').click();
  assert.equal(await page.locator('.template-select').inputValue(), id);
  const update = page.waitForResponse(r => r.request().method() === 'PUT');
  await page.keyboard.press('Control+s'); await update;
  await page.waitForFunction(() => !document.querySelector('button.primary').disabled);
  await button('Rehacer').click();
  assert.equal(await page.locator('.template-select').inputValue(), id);
  await page.screenshot({ path: 'tmp/labels-precision.png' });
  console.log('PASS: grouped move/resize history, cancel, redo branching, keyboard editing isolation, grid/element snaps, guides, zoomed rulers, page history and history after save.');
};
