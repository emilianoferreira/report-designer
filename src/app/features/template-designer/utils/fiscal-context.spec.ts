import { FiscalData, FiscalProfile } from '../../../core/models/fiscal.model';
import { InvoiceData } from '../../../core/models/template.model';
import { SAMPLE_INVOICE_DATA } from '../data/sample-invoice';
import { buildValidationContext } from './fiscal-context';

describe('Fiscal context (facts, not normative rules)', () => {
  const empty = (): InvoiceData => ({ invoice: {}, invoiceLines: [], company: {} });
  const profile: FiscalProfile = { schemaVersion: '1.0', jurisdiction: 'UY', output: 'browser', cfeType: 111 };
  const fiscal = (facts: Partial<FiscalData>): FiscalData => ({ schemaVersion: '1.0', ...facts });

  it('keeps old examples unchanged and does not infer a CFE type, regime, signature or total', () => {
    const before = JSON.stringify(SAMPLE_INVOICE_DATA);
    const context = buildValidationContext(undefined, SAMPLE_INVOICE_DATA);
    expect(context.profile).toBeUndefined();
    expect(context.facts.cfeType.state).toBe('unknown');
    expect(context.facts.issuerRegime.state).toBe('unknown');
    expect(context.facts.signatureHash.state).toBe('unknown');
    expect(context.facts.signatureDate.state).toBe('unknown');
    expect(context.facts.totalPayable.state).toBe('unknown');
    expect(context.facts.totalAmount.state).toBe('unknown');
    expect(context.facts.isCfe).toEqual({ state: 'known', value: false,
      candidates: [{ value: false, source: 'legacy', path: 'isCFE' }] });
    expect(JSON.stringify(SAMPLE_INVOICE_DATA)).toBe(before);
  });
  it('does not fill missing invoice facts from a mold profile', () => {
    const context = buildValidationContext(profile, empty());
    expect(context.facts.cfeType.state).toBe('unknown');
    expect(context.profile).toEqual(profile);
    context.profile!.cfeType = 101;
    expect(profile.cfeType).toBe(111);
  });
  for (const code of [101, 102, 103, 111, 112, 113, 181]) {
    it(`preserves explicitly supplied CFE code ${code}, including codes outside the MVP`, () => {
      const context = buildValidationContext(undefined, { ...empty(), fiscal: fiscal({ cfeType: code }) });
      expect(context.facts.cfeType).toEqual({ state: 'known', value: code,
        candidates: [{ value: code, source: 'invoice', path: 'fiscal.cfeType' }] });
    });
  }
  it('preserves false, zero and explicitly empty lists, without converting missing data to empty lists', () => {
    const context = buildValidationContext(undefined, { ...empty(), fiscal: fiscal({
      hasWithholdingsOrPerceptions: false, nonBillableAmount: '0.00', references: []
    }) });
    expect(context.facts.hasWithholdingsOrPerceptions.state).toBe('known');
    expect(context.facts.nonBillableAmount).toEqual(jasmine.objectContaining({ state: 'known', value: '0' }));
    expect(context.facts.references).toEqual(jasmine.objectContaining({ state: 'known', value: [] }));
    expect(context.facts.adjustments.state).toBe('unknown');
  });
  it('keeps full decimal precision and compares equivalent decimal spellings', () => {
    const context = buildValidationContext(undefined,
      { ...empty(), fiscal: fiscal({ totalAmount: '9007199254740993.0100' }) },
      fiscal({ totalAmount: '9007199254740993.01' }));
    expect(context.facts.totalAmount).toEqual(jasmine.objectContaining({ state: 'known', value: '9007199254740993.01' }));
    expect(context.facts.totalAmount.candidates.length).toBe(2);
  });
  it('retains conflicting sources without silently preferring supplemental data', () => {
    const context = buildValidationContext(profile,
      { ...empty(), fiscal: fiscal({ cfeType: 111 }) }, fiscal({ cfeType: 101 }));
    expect(context.facts.cfeType.state).toBe('conflict');
    expect('value' in context.facts.cfeType).toBeFalse();
    expect(context.facts.cfeType.candidates.map(c => c.source)).toEqual(['invoice', 'scenario']);
    expect(context.diagnostics.some(d => d.kind === 'conflicting-data')).toBeTrue();
  });
  it('reports a profile mismatch without changing the document type', () => {
    const context = buildValidationContext(profile, { ...empty(), fiscal: fiscal({ cfeType: 101 }) });
    expect(context.facts.cfeType).toEqual(jasmine.objectContaining({ state: 'known', value: 101 }));
    expect(context.diagnostics.some(d => d.kind === 'profile-mismatch')).toBeTrue();
  });
  it('reports the legacy non-CFE example when a CFE profile is declared', () => {
    const context = buildValidationContext(profile, SAMPLE_INVOICE_DATA);
    expect(context.diagnostics.some(d => d.field === 'isCfe' && d.kind === 'conflicting-data')).toBeTrue();
  });
  it('detects disagreements between actual legacy fields and typed fiscal fields', () => {
    const context = buildValidationContext(undefined, {
      ...SAMPLE_INVOICE_DATA, fiscal: fiscal({ issuerName: 'Otra empresa' })
    });
    expect(context.facts.issuerName.state).toBe('conflict');
    expect(context.facts.issuerName.candidates.length).toBe(3);
  });
  it('never promotes a short security code or an emission date into signature information', () => {
    const context = buildValidationContext(undefined, { ...empty(), CFE: { CodSeguridad: 'ABC123' },
      invoice: { Fecha: '2026-06-30T23:00:00-03:00' } });
    expect(context.facts.securityCode.state).toBe('known');
    expect(context.facts.signatureHash.state).toBe('unknown');
    expect(context.facts.signatureDate.state).toBe('unknown');
    expect(context.facts.issueDate).toEqual(jasmine.objectContaining({ value: '2026-06-30T23:00:00-03:00' }));
  });
  it('rejects malformed shapes and does not hide them behind valid supplemental values', () => {
    const malformed = { schemaVersion: '1.0', totalAmount: 123, isCfe: 'true', issueDate: '2026-02-30', references: {} };
    const context = buildValidationContext(undefined, { ...empty(), fiscal: malformed as unknown as FiscalData }, fiscal({ totalAmount: '123' }));
    for (const key of ['totalAmount', 'isCfe', 'issueDate', 'references'] as const) expect(context.facts[key].state).toBe('unknown');
    expect(context.diagnostics.filter(d => d.kind === 'invalid-data').length).toBe(4);
  });
  it('abstains on an unknown version and retains the original input', () => {
    const input = { schemaVersion: '2.0', cfeType: 111 } as unknown as FiscalData;
    const context = buildValidationContext(undefined, { ...empty(), fiscal: input });
    expect(context.facts.cfeType.state).toBe('unknown');
    expect(context.diagnostics[0].kind).toBe('unsupported-version');
    expect(input.schemaVersion as string).toBe('2.0');
  });
  it('accepts optional reference fields, negative adjustments and zero without normative judgments', () => {
    const input = fiscal({ references: [{ global: true, reason: 'Ajuste del período' },
      { cfeType: 111, series: 'A', number: '0001', amount: '0', currency: 'USD' }],
      adjustments: [{ kind: 'discount', amount: '-10.00', billingIndicator: 7 }] });
    const before = JSON.stringify(input);
    const context = buildValidationContext(undefined, { ...empty(), fiscal: input });
    expect(context.facts.references.state).toBe('known');
    expect(context.facts.adjustments.state).toBe('known');
    expect(context.diagnostics).toEqual([]);
    expect(JSON.stringify(input)).toBe(before);
  });
});
