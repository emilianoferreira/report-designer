import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

export async function checkReportSaveConflict(page, origin, report) {
  const second = await page.context().newPage();
  const reportUrl = origin + '/designer/' + report.id;
  const designPath = '/api/templates/' + report.id + '/design';
  const height = tab => tab.locator('#report-section-height');
  const header = report.template_json.template.sections.header.height;
  const footer = report.template_json.template.sections.footer.height;
  const setHeight = async (tab, value) => {
    await height(tab).fill(String(value));
    await height(tab).press('Tab');
  };
  const save = async tab => {
    const response = tab.waitForResponse(candidate => candidate.request().method() === 'PUT' &&
      new URL(candidate.url()).pathname === designPath);
    await tab.getByRole('button', { name: 'Guardar', exact: true }).click();
    return response;
  };

  try {
    await Promise.all([page.goto(reportUrl), second.goto(reportUrl)]);
    await expect(height(page)).toHaveValue(String(header));
    await expect(height(second)).toHaveValue(String(header));
    await setHeight(page, header + 1);
    const winner = await save(page);
    assert.equal(winner.status(), 200, await winner.text());
    const confirmed = await winner.json();
    assert.notEqual(confirmed.version, report.version);

    await second.locator('#report-section').selectOption('footer');
    await setHeight(second, footer + 2);
    const stale = await save(second);
    assert.equal(await stale.request().headerValue('if-match'), JSON.stringify(String(report.version ?? 0)));
    assert.equal(stale.status(), 409, await stale.text());
    await expect(second.getByRole('alert')).toContainText('Tu borrador se conservó');
    await expect(height(second)).toHaveValue(String(footer + 2));

    const copyResponse = second.waitForResponse(candidate => candidate.request().method() === 'POST' &&
      new URL(candidate.url()).pathname === '/api/templates');
    await second.getByRole('button', { name: 'Guardar borrador como copia' }).click();
    const created = await copyResponse;
    assert.equal(created.status(), 201, await created.text());
    const copy = await created.json();
    assert.notEqual(copy.id, report.id);
    assert.equal(copy.template_json.template.sections.header.height, header);
    assert.equal(copy.template_json.template.sections.footer.height, footer + 2);
    const original = await (await second.request.get(origin + '/api/templates/' + report.id)).json();
    assert.deepEqual(original.template_json, confirmed.template_json);
    await expect(second.getByRole('link', { name: 'Abrir copia en otra pestaña' })).toHaveAttribute('href', '/designer/' + copy.id);

    second.once('dialog', dialog => dialog.accept());
    await second.getByRole('button', { name: 'Recargar versión del servidor' }).click();
    await expect(height(second)).toHaveValue(String(header + 1));
    await second.locator('#report-section').selectOption('footer');
    await expect(height(second)).toHaveValue(String(footer));
    await setHeight(second, footer + 3);
    const retried = await save(second);
    assert.equal(await retried.request().headerValue('if-match'), JSON.stringify(String(confirmed.version)));
    assert.equal(retried.status(), 200, await retried.text());
    const recovered = await retried.json();
    assert.equal(recovered.template_json.template.sections.header.height, header + 1);
    assert.equal(recovered.template_json.template.sections.footer.height, footer + 3);
  } finally {
    await second.close();
  }
}
