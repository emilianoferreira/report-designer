import { TestBed } from '@angular/core/testing';
import { HtmlRendererService } from '../services/html-renderer.service';
import { createDefaultTemplate } from '../data/default-template';
import { SAMPLE_INVOICE_DATA } from '../data/sample-invoice';
import { createElement } from './element-factory';
import { fiscalZones } from './fiscal-identification';
import { buildValidationContext } from './fiscal-context';
import { FISCAL_FIELD_REQUIREMENTS } from './fiscal-rule-catalogue';
import { evaluateStaticFiscalRules } from './static-fiscal-rules';

describe('Fiscal semantic identification', () => {
  it('keeps historical templates and ordinary render/export byte compatible', () => {
    const template = createDefaultTemplate();
    const before = JSON.stringify(template);
    const renderer = TestBed.inject(HtmlRendererService);
    const html = renderer.renderPreview(template, SAMPLE_INVOICE_DATA);
    const exported = renderer.exportAsZureoTemplate(template);
    const artifact = renderer.renderWithEvidence(template, SAMPLE_INVOICE_DATA);
    expect(JSON.stringify(template)).toBe(before);
    expect(artifact.evidence.content!.some(c => c.origin === 'generated' && c.roles.includes('detail.description'))).toBeTrue();
    expect(renderer.renderPreview(template, SAMPLE_INVOICE_DATA)).toBe(html);
    expect(renderer.exportAsZureoTemplate(template)).toBe(exported);
    expect(exported).not.toContain('data-render-content');
  });
  it('preserves multiple declared meanings without inferring roles from identical text', () => {
    const template = createDefaultTemplate();
    const first = { ...createElement('text'), type: 'text' as const, content: 'Igual', fiscalRoles: ['issuer.name', 'recipient.name'] as const };
    template.sections.header.elements = [{ ...first, fiscalRoles: [...first.fiscalRoles] }, { ...first, id: 'other', fiscalRoles: [] }];
    const content = TestBed.inject(HtmlRendererService).renderWithEvidence(template, SAMPLE_INVOICE_DATA).evidence.content!;
    expect(content.find(c => c.elementId === first.id)!.zones).toEqual(['issuer', 'recipient']);
    expect(content.find(c => c.elementId === 'other')!.roles).toEqual([]);
    expect(fiscalZones(['document.date', 'security.qr', 'unknown'])).toEqual(['body', 'fiscal-footer']);
  });
  it('evaluates obligations using known facts and abstains for conflicts', () => {
    const context = (operationType?: 'goods' | 'services') => buildValidationContext(undefined, {
      invoice: {}, invoiceLines: [], company: {}, fiscal: { schemaVersion: '1.0', isCfe: true, cfeType: 111, operationType }
    });
    const rule = FISCAL_FIELD_REQUIREMENTS.find(r => r.id === 'CON-02.quantity-price')!;
    expect(rule.applicability(context('goods'))).toBe('required');
    expect(rule.applicability(context('services'))).toBe('optional');
    expect(rule.applicability(context())).toBe('pending');
    const conflicting = context('goods');
    conflicting.facts.operationType = { state: 'conflict', candidates: [] };
    expect(rule.applicability(conflicting)).toBe('pending');
    expect(FISCAL_FIELD_REQUIREMENTS[0].applicability(context())).toBe('required');
  });
  it('gives separate identities to multiple findings of one rule', () => {
    const template = createDefaultTemplate();
    template.sections.header.elements = [createElement('text'), createElement('text'), createElement('text')];
    template.sections.header.elements.forEach(e => e.id = 'duplicate');
    const report = evaluateStaticFiscalRules(template, buildValidationContext(undefined, SAMPLE_INVOICE_DATA));
    const findings = report.results.filter(r => r.ruleId === 'TEC-ID');
    expect(findings.length).toBe(2);
    expect(new Set(findings.map(f => f.findingId)).size).toBe(2);
    expect(findings.every(f => f.severity === 'error' && f.status === 'fail')).toBeTrue();
    findings[0].severity = 'warning';
    expect(findings[0].status).toBe('fail');
  });
  it('traces ticket composites and keeps ambiguous totals without fiscal roles', () => {
    const template = createDefaultTemplate();
    template.page.dynamicHeight = true;
    template.sections.footer.elements = [];
    const artifact = TestBed.inject(HtmlRendererService).renderWithEvidence(template, SAMPLE_INVOICE_DATA);
    const content = artifact.evidence.content!;
    const quantityPrice = content.find(c => c.origin === 'generated' && c.roles.includes('detail.unit-price'))!;
    expect(quantityPrice.association).toBe('composite');
    expect(quantityPrice.sourcePaths.length).toBe(2);
    expect(content.find(c => c.sourcePaths.includes('Total'))!.roles).toEqual([]);
    expect(new Set(content.map(c => c.instanceId)).size).toBe(content.length);
    expect(artifact.html).toContain('data-render-content="' + quantityPrice.instanceId + '"');
  });
});
