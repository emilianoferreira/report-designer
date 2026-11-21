import { buildValidationContext } from './fiscal-context';
import { buildValidationFeedback, findingTarget, printFailureLabel } from './validation-feedback';
import { confirmedPrintFailures, decideBrowserPrint } from './print-validation-policy';
import { RuleResult } from './static-fiscal-rules';

export const contentFinding = (ruleId: string, patch: Partial<RuleResult> = {}): RuleResult => ({
  id: ruleId, ruleId, findingId: ruleId + ':instance', title: 'Campo', status: 'fail', severity: 'warning', category: 'normative',
  output: 'browser', evidenceIds: ['ink'], page: 1, fieldPath: 'lines.1.unitPrice', message: 'Valor diferente.', action: 'Revisar el campo.',
  source: '', reference: '', elements: [{ id: 'field', section: 'header' }], ...patch
});
describe('Integrated validation feedback and content print policy', () => {
  const context = (isCfe = true) => buildValidationContext(undefined, { invoice: {}, company: {}, invoiceLines: [],
    fiscal: { schemaVersion: '1.0', isCfe, cfeType: 111 } });
  const report = (...results: RuleResult[]) => ({ scope: 'rendered-browser', results, obligationMatrix: { version: '1.0' } });
  it('blocks confirmed receiver, amount and reference instances independently of severity', () => {
    const findings = [contentFinding('REC-FIELD.name'), contentFinding('REC-BOX'), contentFinding('AMT-FIELD'),
      contentFinding('AMT-CURRENCY'), contentFinding('AMT-VAT-MENTION'), contentFinding('REF-FIELD'), contentFinding('REF-CURRENCY')];
    expect(decideBrowserPrint(context(), report(...findings), 'a', 'a').failures).toEqual(findings);
  });
  it('requires content evidence and page identity without turning data or coverage diagnostics into blocks', () => {
    const findings = [contentFinding('REC-FIELD.name', { evidenceIds: [] }), contentFinding('AMT-FIELD', { page: undefined }),
      contentFinding('REF-FIELD', { page: 0 }), contentFinding('REF-COLLECTION'), contentFinding('REF-NEED'), contentFinding('AMT-COVERAGE')];
    expect(confirmedPrintFailures(report(...findings))).toEqual([]);
    expect(buildValidationFeedback(context(), report(...findings), 'a', 'a').state).toBe('allow');
  });
  it('keeps pending errors nonblocking and retains legacy confirmed dimension/geometry checks', () => {
    const pending = contentFinding('REF-FIELD', { status: 'pending', severity: 'error' });
    expect(decideBrowserPrint(context(), report(pending), 'a', 'a').state).toBe('allow');
    const dimensions = contentFinding('PAP-01', { page: undefined, evidenceIds: [] });
    const overlap = contentFinding('TEC-OVERLAP', { category: 'technical' });
    expect(confirmedPrintFailures(report(dimensions, overlap))).toEqual([dimensions, overlap]);
  });
  it('groups every instance by family and explains verified/pending scope instead of certifying a document', () => {
    const feedback = buildValidationFeedback(context(), report(contentFinding('REC-FIELD.name', { fieldPath: 'receiverName' }),
      contentFinding('AMT-FIELD', { status: 'pass' }), contentFinding('REF-FIELD', { status: 'pending', fieldPath: 'references.0.number' })), 'a', 'a');
    expect(feedback.groups.map(group => group.key)).toEqual(['receiver', 'amounts', 'references']);
    expect(feedback.typeLabel).toBe('e-Factura'); expect(feedback.matrixVersion).toBe('1.0');
    expect(feedback.groups[0].findings[0].blocking).toBeTrue();
    expect(feedback.groups[1].findings[0].target).toBe('Ítem 2');
    expect(feedback.groups[1].findings[0].label).toBe('Verificado en este escenario');
    expect(feedback.groups[2].findings[0].label).toBe('Pendiente · no bloquea');
  });
  it('withdraws stale/foreign output and never uses Zureo findings as browser controls', () => {
    const browser = report(contentFinding('AMT-FIELD'));
    expect(buildValidationFeedback(context(), browser, 'old', 'new').groups).toEqual([]);
    expect(buildValidationFeedback(context(), { ...browser, scope: 'rendered-zureo' }, 'a', 'a').state).toBe('refresh');
    expect(buildValidationFeedback(context(), report(contentFinding('AMT-FIELD', { output: 'zureo' })), 'a', 'a').groups).toEqual([]);
  });
  it('keeps confirmed design findings visible without applying the fiscal gate to a non-CFE', () => {
    const feedback = buildValidationFeedback(context(false), report(contentFinding('REC-FIELD.name')), 'a', 'a');
    expect(feedback.state).toBe('allow'); expect(feedback.blockingCount).toBe(0);
    expect(feedback.groups[0].findings[0].label).toContain('no activa bloqueo');
  });
  it('preserves page instances, deduplicates only selection buttons and labels the affected subject', () => {
    const first = contentFinding('REF-FIELD', { fieldPath: 'references.1.number', elements: [{ id: 'n', section: 'header' }, { id: 'n', section: 'header' }] });
    const second = { ...first, findingId: 'other-page', page: 2 };
    const group = buildValidationFeedback(context(), report(first, second), 'a', 'a').groups[0];
    expect(group.findings.length).toBe(2); expect(group.findings[0].elements.length).toBe(1);
    expect(printFailureLabel(second)).toContain('Referencia 2 · página 2');
    expect(findingTarget(contentFinding('AMT-FIELD', { fieldPath: 'lines.2.taxes.1.amount' }))).toBe('Ítem 3 · tributo 2');
  });
});
