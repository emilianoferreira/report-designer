import { TestBed } from '@angular/core/testing';
import { HtmlRendererService } from './html-renderer.service';
import { createDefaultTemplate } from '../data/default-template';
import { createElement } from '../utils/element-factory';
import { SAMPLE_INVOICE_DATA } from '../data/sample-invoice';

describe('Renderer evidence and fidelity', () => {
  it('traces emitted, hidden and generated content without changing the input', () => {
    const t = createDefaultTemplate();
    const hidden = createElement('text'); hidden.visibility = { type: 'conditional', expression: 'false' };
    t.sections.header.elements.push(hidden);
    const before = JSON.stringify(t);
    const result = TestBed.inject(HtmlRendererService).renderWithEvidence(t, SAMPLE_INVOICE_DATA);
    expect(JSON.stringify(t)).toBe(before);
    expect(result.evidence.elements.find(e => e.id === hidden.id)!.emitted).toBeFalse();
    expect(result.html).toContain('data-render-element=');
    expect(result.html).toContain('data-render-source="invoiceLines.0"');
    expect(result.evidence.generated!.some(b => b.kind === 'generated-row')).toBeTrue();
    expect(JSON.parse(result.inputSnapshot).template).toEqual(t);
  });
  it('does not invent QR or barcode content and associates diagnostics with the source element', () => {
    const t = createDefaultTemplate();
    const qr = createElement('qrCode'); const barcode = createElement('barcode');
    t.sections.header.elements = [qr, barcode];
    const result = TestBed.inject(HtmlRendererService).renderWithEvidence(t, SAMPLE_INVOICE_DATA);
    expect(result.html).not.toContain('https://example.com');
    expect(result.html).not.toContain('123456789');
    expect(result.evidence.diagnostics.some(d => d.elementId === qr.id && d.code === 'missing-value')).toBeTrue();
    expect(result.evidence.diagnostics.some(d => d.elementId === barcode.id && d.code === 'missing-value')).toBeTrue();
  });
  it('keeps visibility errors from becoming truthy and does not leak diagnostics between renders', () => {
    const t = createDefaultTemplate(); const el = createElement('text');
    el.visibility = { type: 'conditional', expression: 'missing.deep.field' };
    t.sections.header.elements = [el];
    const renderer = TestBed.inject(HtmlRendererService);
    const result = renderer.renderWithEvidence(t, SAMPLE_INVOICE_DATA);
    expect(result.evidence.elements[0].emitted).toBeFalse();
    expect(result.evidence.diagnostics.some(d => d.code === 'expression-error' && d.elementId === el.id)).toBeTrue();
    el.visibility = { type: 'always' };
    expect(renderer.renderWithEvidence(t, SAMPLE_INVOICE_DATA).evidence.diagnostics.some(d => d.code === 'expression-error')).toBeFalse();
  });
  it('retains absolute rectangle placement and applies screen/print visibility with CSS', () => {
    const t = createDefaultTemplate(); const shape = createElement('rectangle');
    shape.screenOnly = true;
    t.sections.header.elements = [shape];
    const html = TestBed.inject(HtmlRendererService).renderPreview(t, SAMPLE_INVOICE_DATA);
    expect(html).toContain('element-screen-only');
    expect(html).not.toContain('position:relative;');
    expect(html).toContain('@media print { .element-screen-only { display: none !important; } }');
  });
  it('reports ticket omissions, automatic paper sizing and separates QR symbol from its quiet zone', () => {
    const t = createDefaultTemplate(); t.page.dynamicHeight = true;
    const qr = { ...createElement('qrCode'), type: 'qrCode' as const, dataBinding: 'payload', errorCorrection: 'M' as const };
    t.sections.header.elements = [qr];
    const result = TestBed.inject(HtmlRendererService).renderWithEvidence(t, { ...SAMPLE_INVOICE_DATA, payload: 'prueba' });
    expect(result.html).toContain('size: auto;');
    expect(result.html).toContain('data-qr-quiet-modules="4"');
    expect(result.evidence.diagnostics.some(d => d.code === 'omitted-element')).toBeTrue();
  });
});
