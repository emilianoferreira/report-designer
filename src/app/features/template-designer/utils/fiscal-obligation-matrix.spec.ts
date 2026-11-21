import { CFE_TYPES, FISCAL_ROLE_LABELS } from '../../../core/models/fiscal.model';
import { buildValidationContext } from './fiscal-context';
import { FISCAL_FIELD_REQUIREMENTS } from './fiscal-rule-catalogue';
import { FISCAL_OBLIGATION_MATRIX, obligationForContext } from './fiscal-obligation-matrix';

describe('Printed fiscal obligation matrix', () => {
  const data = (cfeType = 111) => ({ invoice: {}, company: {}, invoiceLines: [], fiscal: { schemaVersion: '1.0' as const, isCfe: true, cfeType } });
  it('inventories every declared field once, with a cell for each supported type and traceable coverage', () => {
    expect(new Set(FISCAL_OBLIGATION_MATRIX.map(row => row.id)).size).toBe(FISCAL_OBLIGATION_MATRIX.length);
    expect(FISCAL_OBLIGATION_MATRIX.filter(row => row.role).map(row => String(row.role)).sort()).toEqual(Object.keys(FISCAL_ROLE_LABELS).sort());
    for (const row of FISCAL_OBLIGATION_MATRIX) {
      expect(Object.keys(row.byType).map(Number).sort()).toEqual(CFE_TYPES.map(type => type.value).sort());
      expect(row.reference.length).toBeGreaterThan(0);
      expect(row.pending.length).toBeGreaterThan(0);
      expect(row.scope).toBe('printed-cfe');
    }
  });
  it('does not transfer sales amounts to remitos or turn a conditional recipient into a violation', () => {
    const total = FISCAL_OBLIGATION_MATRIX.find(row => row.role === 'totals.payable')!;
    expect(total.byType[181]).toBe('not-applicable');
    expect(total.byType[182]).toBe('not-applicable');
    const receiver = FISCAL_OBLIGATION_MATRIX.find(row => row.role === 'recipient.document')!;
    expect(obligationForContext(receiver, buildValidationContext(undefined, data()))).toBe('pending');
    expect(receiver.effectiveFrom).toBeUndefined();
  });
  it('uses the same buyer facts for the receiver matrix cell and the catalogue', () => {
    const invoice = data();
    Object.assign(invoice.fiscal, { finalConsumer: false, receiverDocumentType: 'RUC', receiverSectorException: false,
      receiverNonResidentWithoutRut: false, professionalSecrecy: false });
    const context = buildValidationContext(undefined, invoice);
    const row = FISCAL_OBLIGATION_MATRIX.find(item => item.role === 'recipient.document')!;
    const catalogue = FISCAL_FIELD_REQUIREMENTS.find(item => item.id === 'REC-01.identity')!;
    expect(obligationForContext(row, context)).toBe('required');
    expect(catalogue.applicability(context)).toBe('required');
    context.facts.cfeType = { state: 'known', value: 101, candidates: [] };
    expect(obligationForContext(row, context)).toBe('pending');
    expect(catalogue.applicability(context)).toBe('pending');
  });
  it('agrees with the field catalogue on incompatible versions and output profiles', () => {
    for (const patch of [{ schemaVersion: 'future' }, { output: 'zureo' }, { jurisdiction: 'AR' }]) {
      const profile = { schemaVersion: '1.0', jurisdiction: 'UY', output: 'browser' } as const;
      const context = buildValidationContext(Object.assign({ ...profile }, patch), data());
      expect(obligationForContext(FISCAL_OBLIGATION_MATRIX[0], context)).toBe('pending');
      expect(FISCAL_FIELD_REQUIREMENTS[0].applicability(context)).toBe('pending');
    }
  });
  it('abstains for missing, unsupported, conflicting and mismatching types without suppressing independent facts', () => {
    const row = FISCAL_OBLIGATION_MATRIX[0];
    expect(obligationForContext(row, buildValidationContext(undefined, { invoice: {}, company: {}, invoiceLines: [] }))).toBe('pending');
    expect(obligationForContext(row, buildValidationContext(undefined, data(999)))).toBe('pending');
    expect(obligationForContext(row, buildValidationContext(undefined, data(), { schemaVersion: '1.0', cfeType: 101 }))).toBe('pending');
    expect(obligationForContext(row, buildValidationContext({ schemaVersion: '1.0', jurisdiction: 'UY', output: 'browser', cfeType: 101 }, data()))).toBe('pending');
    const invalid = data(); Object.assign(invalid.fiscal, { currency: 42 });
    expect(obligationForContext(row, buildValidationContext(undefined, invalid))).toBe('required');
  });
});
