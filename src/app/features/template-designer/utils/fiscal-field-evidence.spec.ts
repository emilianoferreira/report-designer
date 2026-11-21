import { TestBed } from '@angular/core/testing';
import { buildValidationContext } from './fiscal-context';
import { describeFieldEvidence, fiscalFieldFact, printedDecimalMatches } from './fiscal-field-evidence';
import { HtmlRendererService } from '../services/html-renderer.service';
import { createDefaultTemplate } from '../data/default-template';
import { SAMPLE_INVOICE_DATA } from '../data/sample-invoice';
import { createElement } from './element-factory';

describe('Per-field fiscal contracts', () => {
  it('retains a valid scalar when its sibling is malformed without claiming a complete collection', () => {
    const context = buildValidationContext(undefined, { invoice: {}, company: {}, invoiceLines: [], fiscal: {
      schemaVersion: '1.0', lines: [{ description: 'Servicio', amount: '1,50' }], references: []
    } });
    expect(context.facts.lines.state).toBe('unknown');
    expect(fiscalFieldFact(context, 'lines.0.description')).toEqual(jasmine.objectContaining({ state: 'known', value: 'Servicio' }));
    expect(fiscalFieldFact(context, 'lines.0.amount').state).toBe('unknown');
    expect(fiscalFieldFact(context, 'lines.1.description').state).toBe('unknown');
    expect(context.facts.references).toEqual(jasmine.objectContaining({ state: 'known', value: [] }));
    expect(context.facts.taxes.state).toBe('unknown');
  });
  it('preserves nested provenance and avoids matching different references by value or array position across sources', () => {
    const context = buildValidationContext(undefined, { invoice: {}, company: {}, invoiceLines: [], fiscal: {
      schemaVersion: '1.0', references: [{ number: 'A', reason: 'Igual' }, { number: 'B', reason: 'Igual' }]
    } });
    const fact = fiscalFieldFact(context, 'references.1.reason');
    expect(fact.candidates[0].path).toBe('fiscal.references.1.reason');
    context.facts.references = { state: 'conflict', candidates: [] };
    expect(fiscalFieldFact(context, 'references.1.reason').state).toBe('conflict');
  });
  it('accepts optional operation facts and keeps old contexts usable', () => {
    const context = buildValidationContext(undefined, { invoice: {}, company: {}, invoiceLines: [], fiscal: {
      schemaVersion: '1.0', exportOperation: false, receiverIsIndividual: true, lines: [{ operationType: 'services' }]
    } });
    expect(context.facts.exportOperation).toEqual(jasmine.objectContaining({ state: 'known', value: false }));
    expect(fiscalFieldFact(context, 'lines.0.operationType')).toEqual(jasmine.objectContaining({ value: 'services' }));
    delete context.fieldFacts;
    expect(fiscalFieldFact(context, 'exportOperation').state).toBe('known');
    expect(fiscalFieldFact(context, 'lines.0.operationType').state).toBe('unknown');
  });
  it('never builds a reference out of two unalignable source lists', () => {
    const context = buildValidationContext(undefined, { invoice: {}, company: {}, invoiceLines: [], fiscal: {
      schemaVersion: '1.0', references: [{ global: true, amount: '1,00' }]
    } }, { schemaVersion: '1.0', references: [{ reason: 'Otro documento' }] });
    expect(context.facts.references.state).toBe('unknown');
    expect(fiscalFieldFact(context, 'references.0.global').state).toBe('unknown');
    expect(fiscalFieldFact(context, 'references.0.reason').state).toBe('unknown');
  });
  it('abstains for an undeclared separator and an unexpected number of decimal places', () => {
    expect(printedDecimalMatches('1.23', '1.23', { decimalSeparator: ',' })).toBeUndefined();
    expect(printedDecimalMatches('12', '12,0', { decimalSeparator: ',', fractionDigits: 2 })).toBeUndefined();
    expect(printedDecimalMatches('12', '12,00', { decimalSeparator: ',', fractionDigits: 2 })).toBeTrue();
  });
  it('traces composites without inventing fiscal correspondence for legacy rows', () => {
    const fields = describeFieldEvidence(['invoiceLines.2.Cantidad', 'invoiceLines.2.PrecioUnitario']);
    expect(fields.every(field => field.association === 'composite' && field.fiscalPath === undefined)).toBeTrue();
    expect(fields[0].instance).toEqual({ collectionPath: 'invoiceLines', index: 2 });
    expect(describeFieldEvidence(['fiscal.references.3.number'])[0].fiscalPath).toBe('references.3.number');
    const template = createDefaultTemplate(); template.page.dynamicHeight = true;
    const before = JSON.stringify(template);
    const renderer = TestBed.inject(HtmlRendererService);
    const html = renderer.renderPreview(template, SAMPLE_INVOICE_DATA), exported = renderer.exportAsZureoTemplate(template);
    const artifact = renderer.renderWithEvidence(template, SAMPLE_INVOICE_DATA);
    expect(artifact.evidence.content!.find(c => c.roles.includes('detail.quantity'))!.fields!.length).toBe(2);
    expect(artifact.evidence.fieldCoverage).toBeUndefined();
    expect(renderer.renderPreview(template, SAMPLE_INVOICE_DATA)).toBe(html);
    expect(renderer.exportAsZureoTemplate(template)).toBe(exported);
    expect(exported).not.toContain('data-render-content');
    expect(JSON.stringify(template)).toBe(before);
  });
  it('compares exact signed decimals with explicit formats and never rounds or guesses', () => {
    expect(printedDecimalMatches('9007199254740993.10', '9.007.199.254.740.993,10', { decimalSeparator: ',', groupingSeparator: '.' })).toBeTrue();
    expect(printedDecimalMatches('-12.50', '-12,500', { decimalSeparator: ',' })).toBeTrue();
    expect(printedDecimalMatches('12.501', '12,50', { decimalSeparator: ',' })).toBeFalse();
    expect(printedDecimalMatches('0', '-0,00', { decimalSeparator: ',' })).toBeTrue();
    expect(printedDecimalMatches('1234', '12.34', { decimalSeparator: ',', groupingSeparator: '.' })).toBeUndefined();
    expect(printedDecimalMatches('12', '$12,00', { decimalSeparator: ',' })).toBeUndefined();
    expect(printedDecimalMatches('12.501', '12,50', { decimalSeparator: ',', fractionDigits: 2 })).toBeUndefined();
  });
  it('records explicit fiscal field coverage as partial even for a hidden or missing binding', () => {
    const template = createDefaultTemplate();
    const element = createElement('dataField');
    if (element.type !== 'dataField') throw new Error('Unexpected factory type');
    element.binding.source = 'fiscal.receiverName';
    template.sections.header.elements = [element];
    const evidence = TestBed.inject(HtmlRendererService).renderWithEvidence(template, SAMPLE_INVOICE_DATA).evidence;
    expect(evidence.fieldCoverage).toEqual([jasmine.objectContaining({ fiscalPath: 'receiverName', state: 'partial' })]);
    expect(evidence.fieldCoverage![0].evidenceIds.length).toBe(1);
    expect(evidence.diagnostics.some(d => d.code === 'missing-value')).toBeTrue();
  });
});
