import { TestBed } from '@angular/core/testing';
import { InvoiceData } from '../../../core/models/template.model';
import { createDefaultTemplate } from '../data/default-template';
import { HtmlRendererService } from '../services/html-renderer.service';
import { RenderEvidence } from '../services/render-evidence';
import { createElement } from './element-factory';
import { buildValidationContext } from './fiscal-context';
import { inspectRenderedLayout } from './rendered-layout-inspector';
import { inspectFiscalPrint } from './rendered-fiscal-rules';
import { inspectReceiverCoverage } from './receiver-page-coverage';
import { receiverRequirements } from './receiver-requirements';
import { decideBrowserPrint } from './print-validation-policy';
import { buildValidationFeedback } from './validation-feedback';

describe('Receiver field and page coverage', () => {
  let frame: HTMLIFrameElement;
  const data: InvoiceData = { invoice: {}, company: {}, invoiceLines: [], printSupport: { kind: 'blank' }, fiscal: {
    schemaVersion: '1.0', isCfe: true, cfeType: 111, issueDate: '2026-11-20', finalConsumer: false, exportOperation: false, receiverNonResidentWithoutRut: false,
    receiverSectorException: false, professionalSecrecy: false, receiverDocumentType: 'RUC', receiverDocumentNumber: '219876540012'
  } };
  const open = (html: string) => {
    frame?.remove();
    frame = document.createElement('iframe'); document.body.append(frame);
    const doc = frame.contentDocument!;
    doc.open(); doc.write(html); doc.close();
    return doc;
  };
  const evidence: RenderEvidence = { version: '1.0', printSurface: true, elements: [], diagnostics: [] };
  const coverage = (doc: Document, input = data, manifest = evidence, pending?: string) => {
    const context = buildValidationContext(undefined, input);
    const layout = inspectRenderedLayout(doc, manifest, { resourcesReady: true });
    return inspectReceiverCoverage(context, receiverRequirements(context), doc, manifest, layout, pending);
  };
  const documentCoverage = (rows: ReturnType<typeof coverage>, page = 1) => rows.find(row => row.role === 'recipient.document' && row.page === page)!;
  afterEach(() => frame?.remove());

  it('publishes coverage and confirms an omission even without a binding', () => {
    const renderer = TestBed.inject(HtmlRendererService), template = createDefaultTemplate();
    template.sections.header.elements = []; template.sections.detail.elements = []; template.sections.footer.elements = [];
    template.sections.header.height = template.sections.detail.height = template.sections.footer.height = 10;
    const context = buildValidationContext(undefined, data);
    const artifact = renderer.renderWithEvidence(template, data, true), doc = open(artifact.html);
    const report = inspectFiscalPrint(template, context, doc, artifact.evidence, true);
    expect(documentCoverage(report.receiverCoverage!)).withContext(documentCoverage(report.receiverCoverage!).reason).toEqual(jasmine.objectContaining({
      state: 'complete', inspected: true, scope: 'browser-html', evidenceIds: []
    }));
    expect(report.results.find(item => item.omission?.coverage.role === 'recipient.document')?.status).toBe('fail');
    expect(decideBrowserPrint(context, report, 'same', 'same').failures.some(item =>
      item.omission?.coverage.role === 'recipient.document')).toBeTrue();
    expect(buildValidationFeedback(context, report, 'same', 'same').receiverCoverage).toBe(report.receiverCoverage);
    expect(buildValidationFeedback(context, report, 'old', 'same').receiverCoverage).toBeUndefined();

    const field = createElement('dataField');
    if (field.type !== 'dataField') throw new Error('Expected data field');
    field.binding = { source: 'fiscal.receiverDocumentNumber' };
    field.fiscalRoles = ['recipient.document'];
    field.position = { x: 1, y: 1 }; field.size = { width: 60, height: 8 };
    template.sections.header.elements = [field];
    const bound = renderer.renderWithEvidence(template, data, true);
    const row = documentCoverage(coverage(open(bound.html), data, bound.evidence));
    expect(row.state).withContext(row.reason).toBe('complete');
    expect(row.evidenceIds.length).toBeGreaterThan(0);
    const support: InvoiceData['printSupport'] = { kind: 'preprinted', pages: [{ page: 1, roles: ['recipient.document'] }] };
    const withPreprint = documentCoverage(coverage(frame.contentDocument!, { ...data, printSupport: support }, bound.evidence));
    expect(withPreprint.state).toBe('partial');
    expect(withPreprint.reason).toContain('preimpreso');
    expect(withPreprint.evidenceIds).toEqual(row.evidenceIds);
    expect(bound.evidence.fieldCoverage?.[0].state).toBe('partial');
  });

  it('distinguishes the declared support per page and treats malformed or incomplete declarations as unknown', () => {
    const doc = open('<style>.page{height:100px}</style><div class="page" data-render-page="1"></div><div class="page" data-render-page="2"></div>');
    const input: InvoiceData = { ...data, printSupport: { kind: 'preprinted', pages: [
      { page: 1, roles: ['recipient.document'] }, { page: 2, roles: [] }
    ] } };
    const rows = coverage(doc, input);
    expect(documentCoverage(rows).reason).toContain('preimpreso');
    expect(documentCoverage(rows).state).toBe('partial');
    expect(documentCoverage(rows, 2).state).toBe('complete');
    expect(rows.find(row => row.role === 'recipient.address' && row.page === 1)?.state).toBe('complete');
    expect(documentCoverage(coverage(doc, { ...data, printSupport: undefined })).reason).toContain('desconocido');
    const malformed = { ...input, printSupport: { kind: 'preprinted', pages: [{ page: 1, roles: ['issuer.name'] }] } } as unknown as InvoiceData;
    expect(documentCoverage(coverage(doc, malformed)).reason).toContain('desconocido');
    const contradictory = { ...data, printSupport: { kind: 'blank', roles: ['recipient.document'] } } as unknown as InvoiceData;
    expect(documentCoverage(coverage(doc, contradictory)).reason).toContain('desconocido');
    const missing = { ...input, printSupport: { kind: 'preprinted' as const, pages: [{ page: 1, roles: [] }] } };
    expect(documentCoverage(coverage(doc, missing), 2).state).toBe('partial');
  });

  it('retains the affected field and page when an explicit binding has no resolved value', () => {
    const doc = open('<style>.page{height:100px}</style><div class="page" data-render-page="1"></div>' +
      '<div class="page" data-render-page="2"><div data-render-element="receiver-document"></div></div>');
    const manifest: RenderEvidence = { ...evidence, content: [{
      elementId: 'receiver-document', instanceId: 'element:header:receiver-document', origin: 'template', section: 'header',
      sourcePaths: ['fiscal.receiverDocumentNumber'], roles: ['recipient.document'], zones: ['recipient'],
      emitted: true, semanticSource: 'declared', association: 'whole',
      fields: [{ sourcePath: 'fiscal.receiverDocumentNumber', fiscalPath: 'receiverDocumentNumber', association: 'whole', presentation: 'raw' }]
    }], diagnostics: [{ code: 'missing-value', message: 'Campo sin resolver', elementId: 'receiver-document' }] };
    const rows = coverage(doc, data, manifest);
    expect(documentCoverage(rows).state).toBe('complete');
    expect(documentCoverage(rows, 2).reason).toContain('sin valor resuelto');
    expect(documentCoverage(rows, 2).state).toBe('partial');
    expect(rows.find(row => row.role === 'recipient.address' && row.page === 2)?.state).toBe('complete');
    const localized = coverage(doc, data, { ...manifest, diagnostics: [
      { code: 'expression-error', message: 'Origen incierto', elementId: 'receiver-document' }
    ] });
    expect(documentCoverage(localized).state).toBe('complete');
    expect(documentCoverage(localized, 2).reason).toContain('en esta página');
  });

  it('reports unresolved obligations and preserves preprinted reasons for a page without ready pagination', () => {
    const doc = open('<style>.page{height:100px}</style><div class="page"></div>');
    const ticket: InvoiceData = { ...data, printSupport: { kind: 'preprinted', pages: [{ page: 1, roles: ['recipient.document'] }] },
      fiscal: { ...data.fiscal!, cfeType: 101, finalConsumer: true, receiverDocumentType: 'CI',
        issueDate: '2026-11-20', exportOperation: false, hasWithholdingsOrPerceptions: false } };
    expect(documentCoverage(coverage(doc, ticket)).reason).toContain('umbral');
    const uninspected = documentCoverage(coverage(doc, ticket, evidence, 'Saltos pendientes'));
    expect(uninspected.inspected).toBeFalse();
    expect(uninspected.state).toBe('partial');
    expect(uninspected.reason).toContain('preimpreso');
  });

  it('does not classify print margin boxes or an empty graphical pseudo-element as fully interpreted', () => {
    const marginBox = '<style>.page{height:100px}@page{@top-left{content:"Identificación"}}</style><div class="page"></div>';
    expect(documentCoverage(coverage(open(marginBox))).reason).toContain('estilos');
    const pseudo = '<style>.page{height:100px}.page::before{content:"";background-image:linear-gradient(red,blue)}</style><div class="page"></div>';
    expect(documentCoverage(coverage(open(pseudo))).reason).toContain('gráficos');
  });

  it('separates a resolved generated field from unattributed content on another page', () => {
    const doc = open('<style>.page{height:100px;width:400px;font:14px Arial}</style>' +
      '<div class="page" data-render-page="1"><div data-render-content="generated-0">219876540012</div></div>' +
      '<div class="page" data-render-page="2"><div data-render-content="generated-1">219876540012</div></div>');
    const manifest: RenderEvidence = { ...evidence, content: [{
      instanceId: 'generated-0', origin: 'generated', section: 'header', sourcePaths: ['fiscal.receiverDocumentNumber'],
      roles: ['recipient.document'], zones: ['recipient'], emitted: true, semanticSource: 'renderer-contract', association: 'whole',
      fields: [{ sourcePath: 'fiscal.receiverDocumentNumber', fiscalPath: 'receiverDocumentNumber', association: 'whole', presentation: 'raw' }]
    }] };
    const rows = coverage(doc, data, manifest);
    expect(documentCoverage(rows).state).toBe('complete');
    expect(documentCoverage(rows).evidenceIds[0]).toContain('generated-0');
    expect(documentCoverage(rows, 2).state).toBe('partial');
  });

  it('leaves ambiguous visible alternatives pending without counting a screen-only element', () => {
    const doc = open('<style>.page{height:100px;width:400px;font:14px Arial}.element-screen-only{display:none}</style>' +
      '<div class="page" data-render-page="1"><div class="element-screen-only">Texto oculto</div></div>' +
      '<div class="page" data-render-page="2"><div class="element-formula">219876540012</div><svg width="5" height="5"></svg></div>');
    expect(documentCoverage(coverage(doc)).state).toBe('complete');
    const unresolved = documentCoverage(coverage(doc), 2);
    expect(unresolved.state).toBe('partial');
    expect(unresolved.reason).toContain('fórmula');
    expect(unresolved.reason).toContain('gráficos');
    expect(documentCoverage(coverage(doc, { ...data, fiscal: { ...data.fiscal!, professionalSecrecy: true,
      issueDate: '2026-11-20' } })).reason).toContain('adenda');
    expect(coverage(doc, data, evidence, 'Saltos pendientes').every(row => !row.inspected && row.state === 'partial')).toBeTrue();
  });

  it('keeps content from print-specific CSS and ambiguous field identities pending', () => {
    const doc = open('<style>.page{height:100px;width:400px;font:14px Arial}' +
      '@media print {.page::before{content:"219876540012"}}</style><div class="page"></div>');
    expect(documentCoverage(coverage(doc)).reason).toContain('estilos');
    const template = createDefaultTemplate();
    template.sections.header.elements = []; template.sections.detail.elements = []; template.sections.footer.elements = [];
    template.sections.header.height = template.sections.detail.height = template.sections.footer.height = 10;
    const field = createElement('dataField');
    if (field.type !== 'dataField') throw new Error('Expected data field');
    field.binding = { source: 'fiscal.issuerRut' };
    field.fiscalRoles = ['recipient.document']; field.position = { x: 1, y: 1 }; field.size = { width: 60, height: 8 };
    template.sections.header.elements = [field];
    const input = { ...data, fiscal: { ...data.fiscal!, issuerRut: '219876540012' } };
    const artifact = TestBed.inject(HtmlRendererService).renderWithEvidence(template, input, true);
    expect(documentCoverage(coverage(open(artifact.html), input, artifact.evidence)).state).toBe('partial');
  });

  it('leaves generated content outside the pages, adopted styles and shadow content pending', () => {
    const doc = open('<style>.page{height:100px;width:400px}</style><div class="page"></div>');
    expect(documentCoverage(coverage(doc)).state).toBe('complete');

    const style = doc.createElement('style');
    style.textContent = 'body::before{content:"219876540012"}';
    doc.head.append(style);
    expect(documentCoverage(coverage(doc)).reason).toContain('fuera de las páginas');
    style.remove();

    const sheet = new (doc.defaultView as Window & typeof globalThis).CSSStyleSheet();
    sheet.replaceSync('@media print {.page::before{content:"219876540012"}}');
    doc.adoptedStyleSheets = [sheet];
    expect(documentCoverage(coverage(doc)).reason).toContain('estilos');
    doc.adoptedStyleSheets = [];

    const host = doc.createElement('div');
    host.attachShadow({ mode: 'open' }).textContent = '219876540012';
    doc.querySelector('.page')!.append(host);
    expect(documentCoverage(coverage(doc)).reason).toContain('contenido generado sin interpretación');
  });
});
