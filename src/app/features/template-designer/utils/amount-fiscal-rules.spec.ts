import { TestBed } from '@angular/core/testing';
import { FiscalData, FiscalRole } from '../../../core/models/fiscal.model';
import { FieldEvidence } from './fiscal-field-evidence';
import { buildValidationContext } from './fiscal-context';
import { amountRequirements, comparePrintedAmount, evaluateAmountPrint } from './amount-fiscal-rules';
import { inspectRenderedLayout } from './rendered-layout-inspector';
import { inspectFiscalPrint } from './rendered-fiscal-rules';
import { decideBrowserPrint } from './print-validation-policy';
import { RenderEvidence } from '../services/render-evidence';
import { createDefaultTemplate } from '../data/default-template';
import { createElement } from './element-factory';
import { HtmlRendererService } from '../services/html-renderer.service';
import { SAMPLE_INVOICE_DATA } from '../data/sample-invoice';

describe('Printed amount, currency and sign rules', () => {
  const base: FiscalData = { schemaVersion: '1.0', isCfe: true, cfeType: 111, issuerRegime: 'general', operationType: 'goods',
    currency: 'UYU', totalAmount: '100', totalPayable: '100' };
  const context = (patch: Partial<FiscalData> = {}) => buildValidationContext(undefined, { invoice: {}, company: {}, invoiceLines: [], fiscal: { ...base, ...patch } });
  const raw: FieldEvidence = { sourcePath: 'fiscal.totalAmount', fiscalPath: 'totalAmount', association: 'whole', presentation: 'raw' };
  const formatted: FieldEvidence = { ...raw, presentation: 'formatted', numericFormat: { decimalSeparator: ',', groupingSeparator: '.', fractionDigits: 2, prefix: '' } };
  let frame: HTMLIFrameElement;
  interface Item { path?: string; roles: FiscalRole[]; text: string; format?: FieldEvidence; hidden?: boolean; }
  const fixture = (items: Item[], pages = 1) => {
    const evidence: RenderEvidence = { version: '1.0', elements: [], content: [], diagnostics: [] };
    const body = items.map((item, index) => {
      const id = 'item' + index;
      evidence.elements.push({ id, section: 'header', emitted: true, roles: item.roles });
      evidence.content!.push({ instanceId: 'element:header:' + id, origin: 'template', elementId: id, section: 'header', roles: item.roles,
        zones: ['body'], sourcePaths: item.path ? ['fiscal.' + item.path] : [], emitted: true, semanticSource: 'declared', association: 'whole',
        fields: item.path ? [{ ...raw, ...item.format, sourcePath: 'fiscal.' + item.path, fiscalPath: item.path }] : [] });
      return `<div data-render-element="${id}" data-render-section="header" style="position:absolute;left:15px;top:${10 + index * 24}px;${item.hidden ? 'display:none;' : ''}">${item.text}</div>`;
    }).join('');
    frame = document.createElement('iframe'); document.body.append(frame); const doc = frame.contentDocument!;
    doc.open(); doc.write('<style>body{margin:0;font:12px Arial}.page{position:relative;width:600px;height:500px}</style>' +
      Array.from({ length: pages }, () => `<div class="page">${body}</div>`).join('')); doc.close();
    return { doc, evidence, layout: inspectRenderedLayout(doc, evidence, { resourcesReady: true }) };
  };
  const inspect = (items: Item[], patch: Partial<FiscalData> = {}, pages = 1) => {
    const { doc, evidence, layout } = fixture(items, pages);
    return evaluateAmountPrint(context(patch), doc, evidence, layout);
  };
  const fieldResults = (results: ReturnType<typeof inspect>) => results.filter(r => r.id === 'AMT-FIELD');
  afterEach(() => frame?.remove());
  it('keeps invalid row overrides and adjustment indicators distinct from absent ones', () => {
    const c = context({ lines: [{ operationType: 'unknown' as 'goods' }],
      adjustments: [{ kind: 'discount', billingIndicator: '7' as unknown as number, amount: '12' }] });
    const plan = amountRequirements(c);
    expect(plan.find(r => r.path === 'lines.0.quantity')!.applicability).toBe('pending');
    expect(plan.find(r => r.path === 'adjustments.0.amount')!.signPending).toBeTrue();
  });
  it('recognizes the explicit DGI units UYI and UYR without conversion', () => {
    for (const currency of ['UYI', 'UYR']) {
      const results = inspect([{ path: 'currency', roles: ['totals.currency'], text: currency }], { currency });
      expect(results.find(r => r.fieldPath === 'currency')!.status).toBe('pass');
      frame.remove();
    }
  });
  it('attributes an incorrect total to its own field even when payable is equal', () => {
    const results = inspect([{ path: 'totalAmount', roles: ['totals.amount'], text: '95' },
      { path: 'totalPayable', roles: ['totals.payable'], text: '100' }], {}, 2);
    expect(results.filter(r => r.status === 'fail').map(r => [r.fieldPath, r.page]))
      .toEqual([['totalAmount', 1], ['totalAmount', 2]]);
    expect(results.filter(r => r.fieldPath === 'totalPayable').map(r => r.status)).toEqual(['pass', 'pass']);
  });
  it('keeps an unclassified tax or a remito tax outside the confirmed gate', () => {
    const item: Item = { path: 'taxes.0.amount', roles: ['tax.amount'], text: '90' };
    const unknown = inspect([item], { taxes: [{ amount: '30' }] });
    expect(unknown.find(r => r.fieldPath === item.path)!.status).toBe('pending');
    frame.remove();
    const remito = inspect([item], { cfeType: 181, taxes: [{ kind: 'other', amount: '30' }] });
    expect(remito.find(r => r.fieldPath === item.path)!.status).toBe('not-applicable');
    expect(amountRequirements(context({ lines: [{}] })).find(r => r.path === 'lines.0.discountAmount')!.applicability).toBe('pending');
  });
  it('keeps unsupported currency codes pending and identifies repeated VAT mentions separately', () => {
    const tax: Item = { path: 'taxes.0.name', roles: ['tax.name'], text: 'IVA' };
    const results = inspect([tax, tax, { path: 'currency', roles: ['totals.currency'], text: 'USD' }],
      { issuerRegime: 'monotributo', taxes: [{ kind: 'vat', name: 'IVA' }], currency: 'ZZZ' });
    expect(results.find(r => r.fieldPath === 'currency')!.status).toBe('pending');
    const mentions = results.filter(r => r.id === 'AMT-VAT-MENTION' && r.status === 'fail');
    expect(mentions.length).toBe(2);
    expect(new Set(mentions.map(r => r.findingId)).size).toBe(2);
  });
  it('cannot certify the legacy nonbillable control by finding the same number in another field', () => {
    const { doc, evidence } = fixture([{ path: 'totalAmount', roles: ['totals.non-billable'], text: '100' }]);
    doc.querySelector('[data-render-element]')!.classList.add('element-datafield');
    const report = inspectFiscalPrint(createDefaultTemplate(), context({ nonBillableAmount: '100' }), doc, evidence, true);
    expect(report.results.find(r => r.id === 'CON-05.07')!.status).toBe('pending');
    expect(report.results.find(r => r.fieldPath === 'nonBillableAmount')!.status).toBe('pending');
  });
  it('compares exact decimals, zero and signs with known separators and abstains for rounding or precision loss', () => {
    expect(comparePrintedAmount('0', '-0', raw)).toBeTrue();
    expect(comparePrintedAmount('-100.1', '-100,10', formatted)).toBeTrue();
    expect(comparePrintedAmount('-100', '100,00', formatted)).toBeFalse();
    expect(comparePrintedAmount('100.001', '100,00', formatted)).toBeUndefined();
    expect(comparePrintedAmount('9007199254740993', '9.007.199.254.740.993,00', formatted)).toBeUndefined();
    expect(comparePrintedAmount('9007199254740993', '9007199254740993', raw)).toBeTrue();
    expect(comparePrintedAmount('100', '1.00,00', formatted)).toBeUndefined();
    expect(comparePrintedAmount('100', '$ 100,00', formatted)).toBeUndefined();
  });
  it('keeps goods/services/mixed per-line conditions distinct without transferring sales totals to remitos or resguardos', () => {
    const reqs = amountRequirements(context({ operationType: 'mixed', lines: [{ operationType: 'goods' }, { operationType: 'services' }, {}] }));
    expect(reqs.find(r => r.path === 'lines.0.quantity')!.applicability).toBe('required');
    expect(reqs.find(r => r.path === 'lines.1.unitPrice')!.applicability).toBe('optional');
    expect(reqs.find(r => r.path === 'lines.2.quantity')!.applicability).toBe('pending');
    for (const type of [181, 182]) expect(amountRequirements(context({ cfeType: type })).find(r => r.path === 'totalPayable')!.applicability).toBe('not-applicable');
  });
  it('requires explicit tax classification and allows tickets to omit VAT discrimination', () => {
    expect(amountRequirements(context({ cfeType: 101, taxes: [{ kind: 'vat', amount: '22' }] })).find(r => r.path === 'taxes.0.amount')!.applicability).toBe('optional');
    expect(amountRequirements(context({ taxes: [{ name: 'IVA', amount: '22' }] })).find(r => r.path === 'taxes.0.amount')!.applicability).toBe('pending');
  });
  it('accepts a single amount for equal total and payable, even with a single declared meaning', () => {
    const results = inspect([{ path: 'totalAmount', roles: ['totals.amount'], text: '100' }]);
    expect(fieldResults(results).filter(r => /totalAmount|totalPayable/.test(r.findingId)).every(r => r.status === 'pass')).toBeTrue();
    expect(fieldResults(results).filter(r => /totalAmount|totalPayable/.test(r.findingId)).length).toBe(2);
  });
  it('never shares a different total/payable or matches the same number from a different fiscal field', () => {
    const results = inspect([{ path: 'totalAmount', roles: ['totals.amount', 'totals.payable'], text: '100' }], { totalPayable: '90' });
    expect(fieldResults(results).find(r => r.findingId.includes('totalPayable'))!.status).toBe('pending');
    expect(results.some(r => r.status === 'fail')).toBeFalse();
  });
  it('does not infer historical Total/Subtotal meanings from roles or text', () => {
    const results = inspect([{ roles: ['totals.amount'], text: '100' }]);
    expect(fieldResults(results).find(r => r.findingId.includes('totalAmount'))!.status).toBe('pending');
    expect(results.some(r => r.status === 'fail')).toBeFalse();
  });
  it('confirms a wrong explicit amount and integrates the current print gate', () => {
    const { doc, evidence } = fixture([{ path: 'totalAmount', roles: ['totals.amount'], text: '99' }]);
    const template = createDefaultTemplate(); template.page.width = 600 / (96 / 25.4); template.page.height = 500 / (96 / 25.4);
    const report = inspectFiscalPrint(template, context(), doc, evidence, true);
    expect(report.results.some(r => r.id === 'AMT-FIELD' && r.status === 'fail')).toBeTrue();
    expect(decideBrowserPrint(context(), report, 'same', 'same').state).toBe('block');
    expect(decideBrowserPrint(context({ isCfe: false }), report, 'same', 'same').state).toBe('allow');
  });
  it('keeps malformed, unknown, conflicting and hidden data pending', () => {
    const { doc, evidence, layout } = fixture([{ path: 'totalAmount', roles: ['totals.amount'], text: '99' }]);
    const c = context(); c.facts.totalAmount = { state: 'conflict', candidates: [] }; c.fieldFacts!['totalAmount'] = c.facts.totalAmount;
    expect(evaluateAmountPrint(c, doc, evidence, layout).some(r => r.status === 'fail')).toBeFalse();
    doc.querySelector('[data-render-element]')!.setAttribute('style', 'display:none');
    expect(evaluateAmountPrint(context(), doc, evidence, inspectRenderedLayout(doc, evidence, { resourcesReady: true })).some(r => r.status === 'fail')).toBeFalse();
  });
  it('does not mix equal amounts between different lines and identifies multiple findings individually', () => {
    const results = inspect([{ path: 'lines.0.unitPrice', roles: ['detail.unit-price'], text: '10' },
      { path: 'lines.1.unitPrice', roles: ['detail.unit-price'], text: '12' }], { lines: [{ unitPrice: '10' }, { unitPrice: '10' }] });
    const prices = fieldResults(results).filter(r => r.findingId.includes('unitPrice'));
    expect(prices.map(r => r.status)).toEqual(['pass', 'fail']);
    expect(new Set(prices.map(r => r.findingId)).size).toBe(2);
  });
  it('retains NC source signs and applies only the explicit nonbillable negative indicator', () => {
    const results = inspect([{ path: 'lines.0.amount', roles: ['detail.amount'], text: '10' },
      { path: 'lines.1.amount', roles: ['detail.amount'], text: '10' }], { cfeType: 112, lines: [{ amount: '10', billingIndicator: 1 }, { amount: '10', billingIndicator: 7 }] });
    const amounts = fieldResults(results).filter(r => /:lines\.\d+\.amount:/.test(r.findingId));
    expect(amounts.map(r => r.status)).toEqual(['pass', 'fail']);
  });
  it('does not invent a sign for unknown indicators or invert discounts automatically', () => {
    const results = inspect([{ path: 'lines.0.amount', roles: ['detail.amount'], text: '-10' },
      { path: 'adjustments.0.amount', roles: ['adjustments.amount'], text: '5' }], { lines: [{ amount: '10' }], adjustments: [{ kind: 'discount', amount: '5' }] });
    expect(fieldResults(results).find(r => r.findingId.includes('lines.0.amount'))!.status).toBe('pending');
    expect(fieldResults(results).find(r => r.findingId.includes('adjustments.0.amount'))!.status).toBe('pass');
  });
  it('does not block an opposite-sign discount convention with the same magnitude', () => {
    const results = inspect([{ path: 'adjustments.0.amount', roles: ['adjustments.amount'], text: '-5' }], { adjustments: [{ kind: 'discount', amount: '5' }] });
    expect(fieldResults(results).find(r => r.findingId.includes('adjustments.0.amount'))!.status).toBe('pending');
    expect(results.some(r => r.status === 'fail')).toBeFalse();
  });
  it('compares explicit ISO currency while treating ambiguous symbols as pending', () => {
    const results = inspect([{ path: 'currency', roles: ['totals.currency'], text: 'USD' }]);
    expect(fieldResults(results).find(r => r.findingId.includes('currency'))!.status).toBe('fail');
    frame.remove();
    expect(inspect([{ path: 'currency', roles: ['totals.currency'], text: '$' }]).some(r => r.status === 'fail')).toBeFalse();
  });
  it('checks an explicit US$ monetary prefix without attributing it to quantities', () => {
    const usd = { ...formatted, numericFormat: { ...formatted.numericFormat!, prefix: 'US$ ' } };
    const results = inspect([{ path: 'totalAmount', roles: ['totals.amount'], text: 'US$ 100,00', format: usd }]);
    expect(results.find(r => r.id === 'AMT-CURRENCY')!.status).toBe('fail');
  });
  it('does not treat an isolated VAT number as a prohibited textual mention', () => {
    const results = inspect([{ path: 'taxes.0.name', roles: ['tax.name'], text: 'IVA' },
      { path: 'taxes.0.amount', roles: ['totals.tax'], text: '0' }], { issuerRegime: 'monotributo', taxes: [{ kind: 'vat', name: 'IVA', amount: '0' }] });
    expect(results.filter(r => r.id === 'AMT-VAT-MENTION').map(r => r.status)).toEqual(['fail']);
    expect(fieldResults(results).find(r => r.findingId.includes('taxes.0.amount'))!.status).toBe('pass');
  });
  it('preserves page identities and abstains while pagination or resources are pending', () => {
    const { doc, evidence, layout } = fixture([{ path: 'totalAmount', roles: ['totals.amount'], text: '100' }], 2);
    const rows = fieldResults(evaluateAmountPrint(context(), doc, evidence, layout)).filter(r => r.findingId.includes('totalAmount'));
    expect(rows.map(r => r.page)).toEqual([1, 2]); expect(new Set(rows.map(r => r.findingId)).size).toBe(2);
    expect(evaluateAmountPrint(context(), doc, evidence, layout, 'Pendiente').some(r => r.status === 'fail')).toBeFalse();
    layout.ready = false;
    expect(evaluateAmountPrint(context(), doc, evidence, layout).some(r => r.status === 'fail')).toBeFalse();
  });
  it('keeps duplicate identities and composite bindings pending rather than certifying fragments', () => {
    const { doc, evidence } = fixture([{ path: 'totalAmount', roles: ['totals.amount'], text: '99' }]);
    evidence.content![0].fields![0].association = 'composite';
    expect(evaluateAmountPrint(context(), doc, evidence, inspectRenderedLayout(doc, evidence, { resourcesReady: true })).some(r => r.status === 'fail')).toBeFalse();
    evidence.content![0].fields![0].association = 'whole';
    evidence.content!.push({ ...evidence.content![0] });
    expect(evaluateAmountPrint(context(), doc, evidence, inspectRenderedLayout(doc, evidence, { resourcesReady: true })).some(r => r.status === 'fail')).toBeFalse();
  });
  it('checks zero nonbillable amounts and resguardo retentions without requiring a sales payable', () => {
    const results = inspect([{ path: 'nonBillableAmount', roles: ['totals.non-billable'], text: '0' }], { nonBillableAmount: '0' });
    expect(fieldResults(results).find(r => r.findingId.includes('nonBillableAmount'))!.status).toBe('pass');
    frame.remove();
    const retained = inspect([{ path: 'retainedAmount', roles: ['totals.withholdings'], text: '15' }], { cfeType: 182, retainedAmount: '15', totalPayable: undefined });
    expect(fieldResults(retained).find(r => r.findingId.includes('retainedAmount'))!.status).toBe('pass');
    expect(fieldResults(retained).find(r => r.findingId.includes('totalPayable'))!.status).toBe('not-applicable');
  });
  it('supports the current sheet/ticket renderer and preserves historical preview and Zureo bytes', () => {
    const renderer = TestBed.inject(HtmlRendererService), template = createDefaultTemplate();
    const element = createElement('dataField'); if (element.type !== 'dataField') throw new Error('Unexpected factory type');
    element.binding = { source: 'fiscal.totalAmount', format: { type: 'number', decimals: 2 } }; element.fiscalRoles = ['totals.amount'];
    element.position = { x: 2, y: 2 }; element.size = { width: 40, height: 8 };
    template.sections.header.elements = [element]; template.sections.footer.elements = [];
    const data = { invoice: {}, company: {}, invoiceLines: [], fiscal: base };
    for (const ticket of [false, true]) {
      template.page.dynamicHeight = ticket; if (ticket) template.page.width = 80;
      const before = JSON.stringify(template), html = renderer.renderPreview(template, data), exported = renderer.exportAsZureoTemplate(template);
      const artifact = renderer.renderWithEvidence(template, data, true), { doc } = fixture([]);
      doc.open(); doc.write(artifact.html); doc.close();
      const results = evaluateAmountPrint(context(), doc, artifact.evidence, inspectRenderedLayout(doc, artifact.evidence, { resourcesReady: true }));
      expect(fieldResults(results).find(r => r.findingId.includes('totalAmount'))!.status).toBe('pass');
      expect(renderer.renderPreview(template, data)).toBe(html); expect(renderer.exportAsZureoTemplate(template)).toBe(exported);
      expect(JSON.stringify(template)).toBe(before); frame.remove();
    }
    const historical = createDefaultTemplate(), before = JSON.stringify(historical);
    const html = renderer.renderPreview(historical, SAMPLE_INVOICE_DATA), exported = renderer.exportAsZureoTemplate(historical);
    renderer.renderWithEvidence(historical, SAMPLE_INVOICE_DATA);
    expect(renderer.renderPreview(historical, SAMPLE_INVOICE_DATA)).toBe(html);
    expect(renderer.exportAsZureoTemplate(historical)).toBe(exported); expect(JSON.stringify(historical)).toBe(before);
  });
});
