import { createDefaultTemplate } from '../data/default-template';
import { buildValidationContext } from './fiscal-context';
import { evaluateStaticFiscalRules } from './static-fiscal-rules';

describe('Static fiscal catalogue', () => {
  const template = () => {
    const t = createDefaultTemplate();
    t.compliance = { schemaVersion: '1.0', jurisdiction: 'UY', output: 'browser', cfeType: 111, medium: 'sheet' };
    return t;
  };
  const run = (t = template()) => evaluateStaticFiscalRules(t, buildValidationContext(t.compliance,
    { invoice: {}, invoiceLines: [], company: {} }));
  it('accepts sheet boundaries in either orientation', () => {
    for (const [width, height] of [[57, 150], [150, 57], [216, 356], [356, 216], [210, 297]]) {
      const t = template(); Object.assign(t.page, { width, height });
      expect(run(t).results.find(r => r.id === 'PAP-01')!.status).toBe('pass');
    }
  });
  it('rejects undersize and oversize sheets without rounding away violations', () => {
    for (const [width, height] of [[56.99, 150], [57, 149.99], [216.01, 356], [216, 356.01]]) {
      const t = template(); Object.assign(t.page, { width, height });
      expect(run(t).results.find(r => r.id === 'PAP-01')!.status).toBe('fail');
      expect(run(t).status).toBe('violations');
    }
  });
  it('uses roll width, imposing no invented length limit', () => {
    const t = template(); t.compliance!.medium = 'roll';
    Object.assign(t.page, { width: 57, height: 5000 });
    expect(run(t).results.find(r => r.id === 'PAP-02')!.status).toBe('pass');
    expect(run(t).results.find(r => r.id === 'PAP-01')!.status).toBe('not-applicable');
    t.page.width = 56.99;
    expect(run(t).results.find(r => r.id === 'PAP-02')!.status).toBe('fail');
  });
  it('abstains for absent or unsupported context and invalid dimensions', () => {
    const t = template(); t.compliance!.cfeType = 121;
    expect(run(t).results.find(r => r.id === 'PAP-01')!.status).toBe('pending');
    delete t.compliance;
    expect(run(t).status).toBe('incomplete');
    const invalid = template(); invalid.page.width = NaN;
    expect(run(invalid).results.find(r => r.id === 'PAP-01')!.status).toBe('pending');
  });
  it('never approves a document from role declarations or passes manual measurements', () => {
    const t = template(); t.sections.header.elements[0].fiscalRoles = ['security.qr', 'issuer.rut'];
    const result = run(t);
    expect(result.status).toBe('incomplete');
    for (const id of ['QR-01', 'QR-02', 'LEG-02', 'DIS-02', 'REF-03.05', 'CON-05.04']) {
      expect(result.results.find(r => r.id === id)!.status).toBe('pending');
    }
    expect(result.results.filter(r => r.id.startsWith('CON-05.')).length).toBe(11);
    expect(result.results.filter(r => r.id.startsWith('REF-03.')).length).toBe(8);
  });
  it('does not mutate inputs, execute formulas or confuse technical problems with normative failures', () => {
    const t = template();
    t.sections.header.elements[1].id = t.sections.header.elements[0].id;
    const before = JSON.stringify(t);
    const report = run(t);
    expect(JSON.stringify(t)).toBe(before);
    const issue = report.results.find(r => r.id === 'TEC-ID')!;
    expect(issue.category).toBe('technical');
    expect(issue.elements[0].section).toBe('header');
    expect(report.results.find(r => r.id === 'TEC-02')!.status).toBe('pending');
  });
});
