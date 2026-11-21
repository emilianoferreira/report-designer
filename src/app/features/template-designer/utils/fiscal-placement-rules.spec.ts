import { evaluateFiscalPlacement } from './fiscal-placement-rules';
import { LayoutContent, LayoutEvidence } from '../../../core/models/layout-evidence.model';
import { createDefaultTemplate } from '../data/default-template';
import { buildValidationContext } from './fiscal-context';
import { createElement } from './element-factory';

describe('Conservative fiscal placement', () => {
  const context = () => buildValidationContext(undefined, { invoice: {}, company: {}, invoiceLines: [],
    fiscal: { schemaVersion: '1.0', isCfe: true, cfeType: 111, signatureHash: 'ABCDEF123456' } });
  const content = (id: string, role: string, y: number, page = 1): LayoutContent => ({
    instanceId: `${page}:${id}`, elementId: id, origin: 'template', sourcePaths: [], roles: [role],
    zones: ['fiscal-footer'], page, bounds: { x: 0, y, width: 20, height: 10 },
    ink: [{ x: 0, y, width: 20, height: 10 }], kind: role === 'security.qr' ? 'graphic' : 'text', order: 1, certainty: 'measured', clipped: false
  });
  function run(items: LayoutContent[], pages = 1) {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = Array.from({ length: pages }, (_, index) => `<div class="page"><span data-render-element="code">ABCDEF</span><span data-render-page-label>Pagina ${index + 1}</span></div>`).join('');
    const layout: LayoutEvidence = { ready: true, output: 'browser', pending: [], content: items };
    return evaluateFiscalPlacement(createDefaultTemplate(), context(), layout, doc, undefined, ['qr']);
  }
  it('confirms only a known visible code and its measured relation to QR', () => {
    expect(run([content('qr', 'security.qr', 30), content('code', 'security.code', 10)]).find(r => r.id === 'POS-QR-CODE')?.status).toBe('fail');
    expect(run([content('qr', 'security.qr', 10), content('code', 'security.code', 30)]).find(r => r.id === 'POS-QR-CODE')?.status).toBe('pass');
  });
  it('does not infer location or compliance from zones or unmeasured role declarations', () => {
    const code = content('code', 'security.code', 10); code.certainty = 'unsupported';
    expect(run([content('qr', 'security.qr', 30), code]).some(r => r.status === 'fail')).toBeFalse();
    expect(run([]).some(r => r.status === 'fail')).toBeFalse();
  });
  it('retains separate findings for all pages without turning missing roles into omissions', () => {
    const results = run([content('code', 'security.code', 10, 2), content('qr', 'security.qr', 30, 2)], 3);
    expect(results.filter(r => r.id === 'POS-MULTIPAGE').length).toBe(3);
    expect(new Set(results.map(r => r.findingId)).size).toBe(results.length);
    expect(results.find(r => r.id === 'POS-QR-CODE')?.message).toContain('Página 2');
  });
  it('abstains for unknown or contradictory CFE facts', () => {
    const ctx = context(); ctx.facts.cfeType = { state: 'conflict', candidates: [] };
    const layout: LayoutEvidence = { ready: true, output: 'browser', pending: [], content: [content('qr', 'security.qr', 30), content('code', 'security.code', 10)] };
    expect(evaluateFiscalPlacement(createDefaultTemplate(), ctx, layout, document)).toEqual([]);
  });
  it('does not infer a fiscal QR from a declared role alone', () => {
    const ctx = context();
    const layout: LayoutEvidence = { ready: true, output: 'browser', pending: [], content: [content('qr', 'security.qr', 30), content('code', 'security.code', 10)] };
    const doc = document.implementation.createHTMLDocument(); doc.body.innerHTML = '<div class="page"><span data-render-element="code">ABCDEF</span></div>';
    expect(evaluateFiscalPlacement(createDefaultTemplate(), ctx, layout, doc).some(r => r.id === 'POS-QR-CODE')).toBeFalse();
  });
  it('detects internal issuer inversions only when the specific field values are verified', () => {
    const ctx = context();
    ctx.facts.issuerName = { state: 'known', value: 'Emisor', candidates: [] };
    ctx.facts.issuerAddress = { state: 'known', value: 'Domicilio', candidates: [] };
    const name = content('name', 'issuer.name', 60), address = content('address', 'issuer.address', 20);
    const layout: LayoutEvidence = { ready: true, output: 'browser', pending: [], content: [name, address] };
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<div class="page"><div data-render-element="name">Emisor</div><div data-render-element="address">Domicilio</div></div>';
    expect(evaluateFiscalPlacement(createDefaultTemplate(), ctx, layout, doc).some(r => r.id.startsWith('POS-ISSUER-ORDER') && r.status === 'fail')).toBeTrue();
    ctx.facts.issuerAddress = { state: 'unknown', candidates: [] };
    expect(evaluateFiscalPlacement(createDefaultTemplate(), ctx, layout, doc).some(r => r.status === 'fail')).toBeFalse();
  });
  it('checks 5 mm only for a verified body adenda boundary and known fiscal data', () => {
    const template = createDefaultTemplate();
    template.compliance = { schemaVersion: '1.0', jurisdiction: 'UY', output: 'browser', cfeType: 111, adendaPlacement: 'within-body' };
    const frame = createElement('rectangle');
    if (frame.type !== 'rectangle') throw new Error('fixture');
    frame.id = 'boundary'; frame.shapeType = 'rectangle'; frame.strokeColor = '#000'; frame.strokeWidth = 0.3;
    template.sections.header.elements = [frame];
    const boundary = content('boundary', 'adenda.boundary', 40);
    boundary.kind = 'decoration'; boundary.zones = ['adenda']; boundary.bounds = { x: 0, y: 40, width: 100, height: 50 }; boundary.ink = [];
    const label = content('label', 'adenda.label', 45); label.bounds.x = 10; label.zones = ['adenda']; label.ink = [];
    const adenda = content('adenda', 'adenda.content', 60); adenda.bounds.x = 10; adenda.zones = ['adenda']; adenda.ink = [];
    const issuer = content('issuer', 'issuer.name', 20); issuer.zones = ['issuer'];
    const code = content('code', 'security.code', 120);
    const ctx = context(); ctx.facts.issuerName = { state: 'known', value: 'Emisor', candidates: [] };
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<div class="page"><span data-render-element="issuer">Emisor</span><span data-render-element="code">ABCDEF</span><span data-render-element="label">ADENDA</span></div>';
    const layout: LayoutEvidence = { ready: true, output: 'browser', pending: [], content: [boundary, label, adenda, issuer, code] };
    expect(evaluateFiscalPlacement(template, ctx, layout, doc).find(r => r.id === 'POS-ADENDA-MARGIN')?.status).toBe('fail');
    ctx.facts.professionalSecrecy = { state: 'known', value: true, candidates: [] };
    expect(evaluateFiscalPlacement(template, ctx, layout, doc).find(r => r.id === 'POS-ADENDA-MARGIN')?.status).toBe('pending');
    ctx.facts.professionalSecrecy = { state: 'known', value: false, candidates: [] };
    issuer.bounds.y = 0; issuer.ink[0].y = 0;
    expect(evaluateFiscalPlacement(template, ctx, layout, doc).some(r => r.id === 'POS-ADENDA-MARGIN')).toBeFalse();
    issuer.bounds.y = 20; issuer.ink[0].y = 20; ctx.facts.issuerName = { state: 'unknown', candidates: [] };
    expect(evaluateFiscalPlacement(template, ctx, layout, doc).some(r => r.id === 'POS-ADENDA-MARGIN')).toBeFalse();
  });
});
