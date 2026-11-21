import { TestBed } from '@angular/core/testing';
import { FiscalData, FiscalReference, FiscalRole } from '../../../core/models/fiscal.model';
import { buildValidationContext } from './fiscal-context';
import { referenceRequirements, evaluateReferencePrint } from './reference-fiscal-rules';
import { inspectRenderedLayout } from './rendered-layout-inspector';
import { inspectFiscalPrint } from './rendered-fiscal-rules';
import { decideBrowserPrint } from './print-validation-policy';
import { RenderEvidence } from '../services/render-evidence';
import { FieldEvidence } from './fiscal-field-evidence';
import { createDefaultTemplate } from '../data/default-template';
import { createElement } from './element-factory';
import { HtmlRendererService } from '../services/html-renderer.service';
import { SAMPLE_INVOICE_DATA } from '../data/sample-invoice';

describe('Individual and global printed references', () => {
  const individual: FiscalReference = { global: false, cfeType: 111, cfeTypeName: 'e-Factura', series: 'A', number: '123' };
  const base: FiscalData = { schemaVersion: '1.0', isCfe: true, cfeType: 112, references: [individual], referencesComplete: true, currency: 'UYU' };
  const context = (patch: Partial<FiscalData> = {}) => buildValidationContext(undefined,
    { invoice: {}, company: {}, invoiceLines: [], fiscal: { ...base, ...patch } });
  interface Item { path?: string; role: FiscalRole; text: string; x?: number; y?: number; format?: Partial<FieldEvidence>; hidden?: boolean; }
  let frame: HTMLIFrameElement;
  const fixture = (items: Item[], pages = 1) => {
    const evidence: RenderEvidence = { version: '1.0', elements: [], content: [], diagnostics: [] };
    const body = items.map((item, index) => {
      const id = 'ref' + index;
      evidence.elements.push({ id, section: 'header', roles: [item.role], emitted: true });
      evidence.content!.push({ instanceId: 'element:header:' + id, origin: 'template', elementId: id, section: 'header', roles: [item.role], zones: ['body'],
        sourcePaths: item.path ? ['fiscal.' + item.path] : [], emitted: true, semanticSource: 'declared', association: 'whole',
        fields: item.path ? [{ sourcePath: 'fiscal.' + item.path, fiscalPath: item.path, association: 'whole', presentation: 'raw', ...item.format }] : [] });
      return `<div data-render-element="${id}" data-render-section="header" style="position:absolute;left:${item.x ?? 15}px;top:${item.y ?? 10 + index * 24}px;${item.hidden ? 'display:none' : ''}">${item.text}</div>`;
    }).join('');
    frame = document.createElement('iframe'); document.body.append(frame); const doc = frame.contentDocument!;
    doc.open(); doc.write('<style>body{margin:0;font:12px Arial}.page{position:relative;width:600px;height:500px}</style>' +
      Array.from({ length: pages }, () => `<div class="page">${body}</div>`).join('')); doc.close();
    return { doc, evidence, layout: inspectRenderedLayout(doc, evidence, { resourcesReady: true }) };
  };
  const inspect = (items: Item[], patch: Partial<FiscalData> = {}, pages = 1) => {
    const { doc, evidence, layout } = fixture(items, pages); return evaluateReferencePrint(context(patch), doc, evidence, layout);
  };
  const field = (results: ReturnType<typeof inspect>, path: string) => results.find(r => r.id === 'REF-FIELD' && r.findingId.includes(':' + path + ':'))!;
  const rowItems = (index = 0, y = 10): Item[] => [
    { path: `references.${index}.cfeTypeName`, role: 'reference.type', text: 'e-Factura', x: 15, y },
    { path: `references.${index}.series`, role: 'reference.series', text: 'A', x: 140, y },
    { path: `references.${index}.number`, role: 'reference.number', text: '123', x: 180, y }
  ];
  afterEach(() => frame?.remove());
  it('reports a negative F.8 at source without using it to block a printed amount', () => {
    const results = inspect([{ path: 'references.0.amount', role: 'reference.amount', text: '1' }],
      { references: [{ ...individual, amount: '-1' }] });
    expect(results.find(r => r.id === 'REF-COLLECTION')!.message).toContain('negativo');
    expect(field(results, 'references.0.amount').status).toBe('pending');
    expect(results.some(r => r.status === 'fail')).toBeFalse();
  });
  it('never confirms monetary fields excluded from a global reference or an e-Remito', () => {
    const items: Item[] = [{ path: 'references.0.amount', role: 'reference.amount', text: '9' }];
    for (const extra of [{ amount: '0' }, { currency: 'UYU' }, { exchangeRate: '1' }, { date: 'invalid' }]) {
      const global = inspect(items, { references: [{ global: true, reason: 'Ajuste', ...extra }] });
      expect(global.find(r => r.id === 'REF-COLLECTION')!.status).toBe('pending');
      expect(field(global, 'references.0.amount').status).toBe('pending');
      expect(global.some(r => r.status === 'fail')).toBeFalse();
      frame.remove();
    }
    const remito = inspect(items, { cfeType: 181, references: [{ ...individual, amount: '0' }] });
    expect(field(remito, 'references.0.amount').status).toBe('not-applicable');
    expect(remito.find(r => r.id === 'REF-COLLECTION')!.status).toBe('pending');
  });
  it('keeps a missing global reason or individual identifier visible even with a declared complete list', () => {
    const results = inspect([], { references: [{ global: true }, { global: false, series: 'A' }] });
    const collection = results.find(r => r.id === 'REF-COLLECTION')!;
    expect(collection.status).toBe('pending');
    expect(collection.message).toContain('Referencia 1');
    expect(collection.message).toContain('Referencia 2');
    expect(results.some(r => r.status === 'fail')).toBeFalse();
  });
  it('does not interpret a number formatter on a document identifier or an unknown currency code', () => {
    const results = inspect([{ path: 'references.0.number', role: 'reference.number', text: '123,00',
      format: { presentation: 'formatted', numericFormat: { decimalSeparator: ',', fractionDigits: 2, prefix: '' } } },
      { path: 'references.0.currency', role: 'reference.currency', text: 'USD' }],
      { references: [{ ...individual, currency: 'XXX' }] });
    expect(field(results, 'references.0.number').status).toBe('pending');
    expect(field(results, 'references.0.currency').status).toBe('pending');
  });
  it('renders and verifies a fiscal civil date in the browser time zone', () => {
    const template = createDefaultTemplate(), element = createElement('dataField');
    if (element.type !== 'dataField') throw new Error('Expected data field');
    element.binding = { source: 'fiscal.references.0.date', format: { type: 'date', pattern: 'dd/MM/yyyy' } };
    element.fiscalRoles = ['reference.date']; template.sections.header.elements = [element];
    const patch = { references: [{ ...individual, date: '2024-03-01' }] };
    const artifact = TestBed.inject(HtmlRendererService).renderWithEvidence(template, { invoice: {}, company: {}, invoiceLines: [], fiscal: { ...base, ...patch } }, true);
    const { doc } = fixture([]); doc.open(); doc.write(artifact.html); doc.close();
    expect(doc.querySelector('.element-datafield')!.textContent).toBe('01/03/2024');
    const findings = evaluateReferencePrint(context(patch), doc, artifact.evidence, inspectRenderedLayout(doc, artifact.evidence, { resourcesReady: true }));
    expect(field(findings, 'references.0.date').status).toBe('pass');
  });
  it('requires references for notes, own collection and explicit remito/resguardo adjustments without inferring other operations', () => {
    for (const type of [102, 103, 112, 113]) expect(referenceRequirements(context({ cfeType: type })).needed).toBe('required');
    expect(referenceRequirements(context({ cfeType: 101, ownCollection: true })).needed).toBe('required');
    expect(referenceRequirements(context({ cfeType: 181, lines: [{ billingIndicator: 8 }] })).needed).toBe('required');
    expect(referenceRequirements(context({ cfeType: 182, lines: [{ billingIndicator: 9 }] })).needed).toBe('required');
    expect(referenceRequirements(context({ cfeType: 111, ownCollection: false })).needed).toBe('pending');
  });
  it('distinguishes unknown and empty collections and never blocks due to origin data alone', () => {
    expect(referenceRequirements(context({ references: undefined })).collectionKnown).toBeFalse();
    const empty = referenceRequirements(context({ references: [] }));
    expect(empty.collectionKnown).toBeTrue(); expect(empty.count).toBe(0); expect(empty.diagnostics.length).toBeGreaterThan(0);
    const results = inspect([], { references: [] }); expect(results.some(r => r.status === 'fail')).toBeFalse();
  });
  it('checks source length at 40/41 and does not replace excess references with a global one', () => {
    const refs = Array.from({ length: 40 }, (_, index) => ({ ...individual, number: String(index + 1) }));
    expect(referenceRequirements(context({ references: refs })).diagnostics).toEqual([]);
    refs.push({ global: true, reason: 'Descuento mensual' } as typeof refs[number]);
    const plan = referenceRequirements(context({ references: refs }));
    expect(plan.count).toBe(41); expect(plan.diagnostics.some(d => d.includes('más de 40'))).toBeTrue();
  });
  it('keeps duplicate source identifiers and contradictory global/individual data pending', () => {
    expect(referenceRequirements(context({ references: [{ global: true, cfeType: 111, reason: 'Ajuste' }] })).rows[0].dataPending).toBeTrue();
    expect(referenceRequirements(context({ references: [{ ...individual, cfeTypeName: 'e-Ticket' }] })).rows[0].dataPending).toBeTrue();
    const duplicate = referenceRequirements(context({ references: [{ ...individual, id: 'same' }, { ...individual, id: 'same' }] }));
    expect(duplicate.rows.every(row => row.dataPending)).toBeTrue();
    expect(duplicate.diagnostics.some(d => d.includes('identificación repetida'))).toBeTrue();
  });
  it('preserves known global reason and excludes individual identity/date requirements', () => {
    const results = inspect([{ path: 'references.0.reason', role: 'reference.reason', text: 'Descuento mensual' }], { references: [{ global: true, reason: 'Descuento mensual' }] });
    expect(field(results, 'references.0.reason').status).toBe('pass');
    expect(field(results, 'references.0.series').status).toBe('not-applicable');
    expect(field(results, 'references.0.date').status).toBe('not-applicable');
    expect(results.find(r => r.id === 'REF-ASSOCIATION')!.status).toBe('pass');
  });
  it('never infers individual mode from a missing flag or a matching literal reason', () => {
    const results = inspect([{ path: 'references.0.series', role: 'reference.series', text: 'B' }], { references: [{ series: 'A' }] });
    expect(field(results, 'references.0.series').status).toBe('pending'); expect(results.some(r => r.status === 'fail')).toBeFalse();
  });
  it('accepts a measured individual identity on the same row and does not require a global indicator to print', () => {
    const results = inspect(rowItems());
    expect(field(results, 'references.0.cfeType').status).toBe('pass');
    expect(field(results, 'references.0.number').status).toBe('pass');
    expect(results.find(r => r.id === 'REF-ASSOCIATION')!.status).toBe('pass');
  });
  it('does not combine identical text from different references and identifies findings individually', () => {
    const results = inspect([{ path: 'references.0.reason', role: 'reference.reason', text: 'Mismo motivo' },
      { path: 'references.1.reason', role: 'reference.reason', text: 'Otro motivo' }], { references: [{ global: true, reason: 'Mismo motivo' }, { global: true, reason: 'Mismo motivo' }] });
    expect(field(results, 'references.0.reason').status).toBe('pass'); expect(field(results, 'references.1.reason').status).toBe('fail');
    expect(new Set(results.map(r => r.findingId)).size).toBe(results.length);
  });
  it('keeps historical roles without field association pending instead of assigning a row by text', () => {
    const results = inspect([{ role: 'reference.reason', text: 'Motivo' }], { references: [{ global: true, reason: 'Motivo' }] });
    expect(field(results, 'references.0.reason').status).toBe('pending'); expect(results.some(r => r.status === 'fail')).toBeFalse();
  });
  it('does not retain the former single-reference text approval without field association', () => {
    const { doc, evidence } = fixture([{ role: 'reference.reason', text: 'Motivo' }]);
    const template = createDefaultTemplate(); template.page.width = 600 / (96 / 25.4); template.page.height = 500 / (96 / 25.4);
    const report = inspectFiscalPrint(template, context({ references: [{ global: true, reason: 'Motivo' }] }), doc, evidence, true);
    expect(report.results.find(r => r.id === 'REF-03.02')!.status).toBe('pending');
    expect(field(report.results, 'references.0.reason').status).toBe('pending');
  });
  it('does not certify numeric-only or unsupported type codes as names in words', () => {
    expect(field(inspect([{ path: 'references.0.cfeType', role: 'reference.type', text: '111' }]), 'references.0.cfeType').status).toBe('pending'); frame.remove();
    const results = inspect([{ path: 'references.0.cfeType', role: 'reference.type', text: 'Otro' }], { references: [{ ...individual, cfeType: 999, cfeTypeName: undefined }] });
    expect(field(results, 'references.0.cfeType').status).toBe('pending');
  });
  it('accepts leading zero variants of a numeric CFE number without merging references', () => {
    const results = inspect([{ path: 'references.0.number', role: 'reference.number', text: '000123' }]);
    expect(field(results, 'references.0.number').status).toBe('pass');
  });
  it('checks date formats explicitly and abstains for timestamp timezone ambiguity', () => {
    const item: Item = { path: 'references.0.date', role: 'reference.date', text: '02/01/2026', format: { presentation: 'formatted', dateFormat: 'dd/MM/yyyy' } };
    expect(field(inspect([item], { references: [{ ...individual, date: '2026-01-02' }] }), 'references.0.date').status).toBe('pass'); frame.remove();
    item.text = '01/01/2026';
    expect(field(inspect([item], { references: [{ ...individual, date: '2026-01-02' }] }), 'references.0.date').status).toBe('fail'); frame.remove();
    expect(field(inspect([item], { references: [{ ...individual, date: '2026-01-02T00:30:00Z' }] }), 'references.0.date').status).toBe('pending');
  });
  it('compares original-reference amounts/currency without converting to the current document currency', () => {
    const format: Partial<FieldEvidence> = { presentation: 'formatted', numericFormat: { decimalSeparator: ',', groupingSeparator: '.', fractionDigits: 2, prefix: 'US$ ' } };
    const results = inspect([{ path: 'references.0.amount', role: 'reference.amount', text: 'US$ 0,00', format },
      { path: 'references.0.currency', role: 'reference.currency', text: 'USD' }], { currency: 'UYU', references: [{ ...individual, amount: '0', currency: 'USD' }] });
    expect(field(results, 'references.0.amount').status).toBe('pass'); expect(results.find(r => r.id === 'REF-CURRENCY')!.status).toBe('pass');
    expect(results.some(r => r.status === 'fail')).toBeFalse();
  });
  it('keeps ambiguous currency symbols and rounding pending', () => {
    const results = inspect([{ path: 'references.0.currency', role: 'reference.currency', text: '$' },
      { path: 'references.0.amount', role: 'reference.amount', text: '1,23', format: { presentation: 'formatted', numericFormat: { decimalSeparator: ',', fractionDigits: 2, prefix: '' } } }],
      { references: [{ ...individual, currency: 'UYU', amount: '1.234' }] });
    expect(field(results, 'references.0.currency').status).toBe('pending'); expect(field(results, 'references.0.amount').status).toBe('pending');
  });
  it('preserves noncoded document descriptions without claiming sufficient identification', () => {
    const results = inspect([{ path: 'references.0.documentDescription', role: 'reference.description', text: 'Liquidación 2026-01' },
      { path: 'references.0.reason', role: 'reference.reason', text: 'Ajuste de liquidación' }],
      { references: [{ global: true, documentDescription: 'Liquidación 2026-01', reason: 'Ajuste de liquidación' }] });
    expect(field(results, 'references.0.documentDescription').status).toBe('pass'); expect(results.find(r => r.id === 'REF-COVERAGE')!.status).toBe('pending');
  });
  it('does not approve association when references are interleaved or spread over multiple rows', () => {
    const items = rowItems(); items.push({ path: 'references.1.reason', role: 'reference.reason', text: 'B', x: 120, y: 10 });
    const results = inspect(items, { references: [individual, { global: true, reason: 'B' }] });
    expect(results.find(r => r.id === 'REF-ASSOCIATION' && r.findingId.includes('references.0'))!.status).toBe('pending');
    expect(results.some(r => r.status === 'fail')).toBeFalse(); frame.remove();
    items.pop(); items[2].y = 50;
    expect(inspect(items).find(r => r.id === 'REF-ASSOCIATION')!.status).toBe('pending');
  });
  it('keeps hidden, composite, duplicate and unready evidence pending', () => {
    const { doc, evidence, layout } = fixture([{ path: 'references.0.series', role: 'reference.series', text: 'B' }]);
    evidence.content![0].fields![0].association = 'composite';
    expect(evaluateReferencePrint(context(), doc, evidence, layout).some(r => r.status === 'fail')).toBeFalse();
    evidence.content![0].fields![0].association = 'whole'; evidence.content!.push({ ...evidence.content![0] });
    expect(evaluateReferencePrint(context(), doc, evidence, inspectRenderedLayout(doc, evidence, { resourcesReady: true })).some(r => r.status === 'fail')).toBeFalse();
    layout.ready = false; expect(evaluateReferencePrint(context(), doc, evidence, layout).some(r => r.status === 'fail')).toBeFalse();
  });
  it('attributes generated content by exact instance identity without confusing prefix-similar IDs', () => {
    const { doc, evidence } = fixture([{ path: 'references.0.reason', role: 'reference.reason', text: 'Motivo' }]);
    const entry = evidence.content![0]; entry.origin = 'generated'; entry.instanceId = 'generated-1'; delete entry.elementId;
    const node = doc.querySelector('[data-render-element]')!; node.removeAttribute('data-render-element'); node.setAttribute('data-render-content', 'generated-1');
    evidence.content!.push({ ...entry, instanceId: 'generated-10', fields: [{ ...entry.fields![0], fiscalPath: 'references.1.reason' }] });
    const results = evaluateReferencePrint(context({ references: [{ global: true, reason: 'Motivo' }, { global: true, reason: 'Motivo' }] }), doc, evidence,
      inspectRenderedLayout(doc, evidence, { resourcesReady: true }));
    expect(field(results, 'references.0.reason').status).toBe('pass'); expect(field(results, 'references.1.reason').status).toBe('pending');
  });
  it('does not reconcile reordered or conflicting collections by IDs or equal values', () => {
    const c = context(); c.facts.references = { state: 'conflict', candidates: [] }; c.fieldFacts!['references'] = c.facts.references;
    const { doc, evidence, layout } = fixture([{ path: 'references.0.series', role: 'reference.series', text: 'B' }]);
    expect(evaluateReferencePrint(c, doc, evidence, layout).some(r => r.status === 'fail')).toBeFalse();
  });
  it('integrates confirmed print failures and retains independent severity and output policies', () => {
    const { doc, evidence } = fixture([{ path: 'references.0.series', role: 'reference.series', text: 'B' }]);
    const template = createDefaultTemplate(); template.page.width = 600 / (96 / 25.4); template.page.height = 500 / (96 / 25.4);
    const report = inspectFiscalPrint(template, context(), doc, evidence, true), failure = field(report.results, 'references.0.series');
    expect(failure.status).toBe('fail'); failure.severity = 'warning';
    expect(decideBrowserPrint(context(), report, 'same', 'same').state).toBe('block');
    expect(decideBrowserPrint(context({ isCfe: false }), report, 'same', 'same').state).toBe('allow');
    expect(decideBrowserPrint(context(), { ...report, scope: 'zureo' }, 'same', 'same').state).toBe('refresh');
  });
  it('does not count multipage repetitions as more references and preserves page identities', () => {
    const results = inspect(rowItems(), {}, 2), fields = results.filter(r => r.id === 'REF-FIELD' && r.findingId.includes('references.0.series'));
    expect(fields.map(r => r.page)).toEqual([1, 2]); expect(new Set(fields.map(r => r.findingId)).size).toBe(2);
    expect(results.find(r => r.id === 'REF-COLLECTION')!.message).toContain('1 referencias');
  });
  it('accepts fields on different pages while keeping their visual grouping pending', () => {
    const { doc, evidence } = fixture(rowItems(), 2), pages = doc.querySelectorAll('.page');
    pages[0].querySelector('[data-render-element="ref2"]')!.remove();
    pages[1].querySelector('[data-render-element="ref0"]')!.remove(); pages[1].querySelector('[data-render-element="ref1"]')!.remove();
    const results = evaluateReferencePrint(context(), doc, evidence, inspectRenderedLayout(doc, evidence, { resourcesReady: true }));
    expect(field(results, 'references.0.number').page).toBe(2); expect(field(results, 'references.0.number').status).toBe('pass');
    expect(results.find(r => r.id === 'REF-ASSOCIATION')!.status).toBe('pending'); expect(results.some(r => r.status === 'fail')).toBeFalse();
  });
  it('supports current sheet/ticket bindings and leaves historical preview, exports and templates unchanged', () => {
    const renderer = TestBed.inject(HtmlRendererService), template = createDefaultTemplate();
    const element = createElement('dataField'); if (element.type !== 'dataField') throw new Error('Unexpected factory type');
    element.binding = { source: 'fiscal.references.0.reason' }; element.fiscalRoles = ['reference.reason']; element.position = { x: 2, y: 2 }; element.size = { width: 60, height: 8 };
    template.sections.header.elements = [element]; template.sections.footer.elements = [];
    const data = { invoice: {}, company: {}, invoiceLines: [], fiscal: { ...base, references: [{ global: true, reason: 'Descuento mensual' }] } };
    for (const ticket of [false, true]) {
      template.page.dynamicHeight = ticket; if (ticket) template.page.width = 80;
      const before = JSON.stringify(template), html = renderer.renderPreview(template, data), exported = renderer.exportAsZureoTemplate(template), artifact = renderer.renderWithEvidence(template, data, true);
      const { doc } = fixture([]); doc.open(); doc.write(artifact.html); doc.close();
      expect(field(evaluateReferencePrint(buildValidationContext(undefined, data), doc, artifact.evidence, inspectRenderedLayout(doc, artifact.evidence, { resourcesReady: true })), 'references.0.reason').status).toBe('pass');
      expect(renderer.renderPreview(template, data)).toBe(html); expect(renderer.exportAsZureoTemplate(template)).toBe(exported); expect(JSON.stringify(template)).toBe(before); frame.remove();
    }
    const historical = createDefaultTemplate(), before = JSON.stringify(historical), html = renderer.renderPreview(historical, SAMPLE_INVOICE_DATA), exported = renderer.exportAsZureoTemplate(historical);
    renderer.renderWithEvidence(historical, SAMPLE_INVOICE_DATA);
    expect(renderer.renderPreview(historical, SAMPLE_INVOICE_DATA)).toBe(html); expect(renderer.exportAsZureoTemplate(historical)).toBe(exported); expect(JSON.stringify(historical)).toBe(before);
  });
});
