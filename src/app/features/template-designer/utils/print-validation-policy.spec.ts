import { buildValidationContext } from './fiscal-context';
import { decideBrowserPrint, confirmedPrintFailures, PrintReport } from './print-validation-policy';
import { RuleResult } from './static-fiscal-rules';

describe('Unified browser print policy', () => {
  const context = (isCfe?: boolean) => buildValidationContext(undefined, { invoice: {}, company: {}, invoiceLines: [],
    fiscal: { schemaVersion: '1.0', isCfe } });
  const finding = (ruleId: string, status: RuleResult['status'] = 'fail', category: RuleResult['category'] = 'technical'): RuleResult => ({
    id: ruleId, ruleId, findingId: `${ruleId}:instance`, title: ruleId, status, category, severity: 'error',
    message: '', action: '', source: '', reference: '', output: 'browser', evidenceIds: ['a', 'b'], elements: []
  });
  const report = (...results: RuleResult[]): PrintReport => ({ scope: 'rendered-browser', results });
  it('blocks confirmed normative, overlap and clipping failures for a known CFE', () => {
    const results = [finding('QR-02', 'fail', 'normative'), finding('TEC-OVERLAP'), finding('TEC-CLIP')];
    const decision = decideBrowserPrint(context(true), report(...results), 'current', 'current');
    expect(decision.state).toBe('block'); expect(decision.failures).toEqual(results);
  });
  it('does not block pending warnings, unsupported geometry or unrelated technical diagnostics', () => {
    const results = [finding('TEC-OVERLAP', 'pending'), finding('TEC-CLIP', 'pending'), finding('QR-02', 'pending', 'normative'), finding('TEC-ID')];
    expect(decideBrowserPrint(context(true), report(...results), 'current', 'current').state).toBe('allow');
  });
  it('keeps severity independent of confirmed compliance state', () => {
    const failed = { ...finding('QR-02', 'fail', 'normative'), severity: 'warning' as const };
    const pending = { ...finding('QR-01', 'pending', 'normative'), severity: 'error' as const };
    expect(confirmedPrintFailures(report(failed, pending))).toEqual([failed]);
  });
  it('does not impose the CFE gate on nonfiscal or unknown documents', () => {
    const failures = report(finding('TEC-OVERLAP'), finding('QR-02', 'fail', 'normative'));
    expect(decideBrowserPrint(context(false), failures, 'current', 'current').state).toBe('allow');
    expect(decideBrowserPrint(context(), failures, 'current', 'current').state).toBe('allow');
    const conflict = context(true); conflict.facts.isCfe = { state: 'conflict', candidates: [] };
    expect(decideBrowserPrint(conflict, failures, 'current', 'current').state).toBe('allow');
  });
  it('requires fresh browser evidence without calling a pending check a fiscal block', () => {
    expect(decideBrowserPrint(context(true), undefined, 'a', 'a').state).toBe('refresh');
    expect(decideBrowserPrint(context(true), report(), 'old', 'new').state).toBe('refresh');
    expect(decideBrowserPrint(context(true), { scope: 'static-browser', results: [] }, 'a', 'a').state).toBe('refresh');
  });
  it('never attributes browser checks to Zureo or accepts Zureo findings as browser evidence', () => {
    const foreign = { ...finding('QR-02', 'fail', 'normative'), output: 'zureo' as const };
    expect(confirmedPrintFailures(report(foreign))).toEqual([]);
    expect(confirmedPrintFailures({ scope: 'rendered-zureo', results: [finding('TEC-OVERLAP')] })).toEqual([]);
    expect(decideBrowserPrint(context(true), { scope: 'static-zureo', results: [] }, 'a', 'a').state).toBe('refresh');
  });
  it('keeps every confirmed page-specific instance and requires evidence for technical blocking', () => {
    const first = finding('TEC-OVERLAP'), middle = { ...first, findingId: 'second-instance', page: 2 };
    expect(confirmedPrintFailures(report(first, middle)).length).toBe(2);
    expect(confirmedPrintFailures(report({ ...first, evidenceIds: [] }))).toEqual([]);
  });
});
