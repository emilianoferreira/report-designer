import { TestBed } from '@angular/core/testing';
import { inspectRenderedLayout } from './rendered-layout-inspector';
import { detectContentConflicts } from '../../../shared/utils/content-overlap';
import { HtmlRendererService } from '../services/html-renderer.service';
import { createDefaultTemplate } from '../data/default-template';
import { SAMPLE_INVOICE_MULTILINE } from '../data/sample-invoice';
import { RenderEvidence } from '../services/render-evidence';
import { paginateFiscalPrint } from './paginate-fiscal-print';
import { buildValidationContext } from './fiscal-context';
import { confirmedPrintFailures, inspectFiscalPrint } from './rendered-fiscal-rules';

describe('Rendered layout and painted content', () => {
  let frame: HTMLIFrameElement;
  const evidence: RenderEvidence = { version: '1.0', elements: [], diagnostics: [] };
  const text = (id: string, value = 'MMMM', extra = '') => `<div data-render-element="${id}" data-render-section="header" style="position:absolute;left:20px;top:20px;${extra}">${value}</div>`;
  function documentFor(body: string): Document {
    frame = document.createElement('iframe');
    document.body.append(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(`<style>body{margin:0;font:16px Arial}.page{position:relative;width:400px;height:300px}*{box-sizing:border-box}</style>${body}`);
    doc.close();
    return doc;
  }
  const inspect = (body: string) => inspectRenderedLayout(documentFor(body), evidence, { resourcesReady: true });
  function coverContent(doc: Document, target: Element): void {
    const page = target.closest('.page')!;
    const origin = page.getBoundingClientRect(), box = target.getBoundingClientRect();
    const cover = doc.createElement('div');
    cover.setAttribute('data-render-element', 'foreground');
    cover.style.cssText = `position:absolute;left:${box.left - origin.left}px;top:${box.top - origin.top}px;width:${box.width}px;height:${box.height}px;background:white;z-index:99`;
    page.append(cover);
  }
  afterEach(() => frame?.remove());
  it('does not count background and borders twice for a subthreshold ink intersection', () => {
    const doc = documentFor(`<div class="page">${text('a')}</div>`);
    const initial = inspectRenderedLayout(doc, evidence, { resourcesReady: true });
    const ink = initial.content.find(c => c.kind === 'text')!.ink[0];
    const cover = doc.createElement('div'); cover.dataset['renderElement'] = 'cover';
    cover.style.cssText = `position:absolute;left:${ink.x}px;top:${ink.y}px;width:1px;height:1px;background:white;border:.5px solid white;z-index:3`;
    doc.querySelector('.page')!.append(cover);
    expect(detectContentConflicts(inspectRenderedLayout(doc, evidence, { resourcesReady: true })).filter(c => c.status === 'fail')).toEqual([]);
  });
  it('finds ink clipped by a zero-height element', () => {
    const layout = inspect(`<div class="page">${text('a', 'MMMM', 'height:0;overflow:hidden;')}</div>`);
    expect(detectContentConflicts(layout).some(c => c.kind === 'clipped' && c.status === 'fail')).toBeTrue();
  });
  it('does not assign semantic roles to duplicate IDs', () => {
    const doc = documentFor(`<div class="page">${text('same')}${text('same', 'Otro', 'top:80px;')}</div>`);
    const observations: RenderEvidence = { ...evidence, elements: [{ id: 'same', section: 'header', emitted: true, roles: ['issuer.name'] }],
      content: [{ instanceId: 'element:header:same', origin: 'template', elementId: 'same', section: 'header', roles: ['issuer.name'],
        zones: ['issuer'], sourcePaths: [], emitted: true, semanticSource: 'declared', association: 'whole' }] };
    const layout = inspectRenderedLayout(doc, observations, { resourcesReady: true });
    expect(layout.content.every(c => c.roles.length === 0)).toBeTrue();
    expect(layout.pending.some(p => p.includes('ambiguos'))).toBeTrue();
  });
  it('does not certify text with unsupported effects or ancestor stacking', () => {
    const layout = inspect(`<div class="page"><div style="position:relative;z-index:5">${text('a')}</div>${text('b')}</div>`);
    expect(layout.content.find(c => c.elementId === 'a')!.certainty).toBe('unsupported');
    expect(detectContentConflicts(layout).every(c => c.status === 'pending')).toBeTrue();
  });
  it('never approves unsupported text, and isolates unrelated data diagnostics', () => {
    const doc = documentFor(`<div class="page">${text('date', '2026-01-01').replace('data-render-section', 'class="element-datafield" data-render-section')}</div>`);
    const template = createDefaultTemplate();
    const observations: RenderEvidence = { ...evidence, elements: [{ id: 'date', section: 'header', emitted: true, roles: ['document.date'] }] };
    const ctx = buildValidationContext(undefined, { invoice: {}, company: {}, invoiceLines: [],
      fiscal: { schemaVersion: '1.0', isCfe: true, cfeType: 111, issueDate: '2026-01-01', currency: 123 as unknown as string } });
    expect(inspectFiscalPrint(template, ctx, doc, observations, true).results.find(r => r.id === 'CON-01')?.status).toBe('pass');
    (doc.querySelector('[data-render-element]') as HTMLElement).style.textShadow = '1px 1px black';
    expect(inspectFiscalPrint(template, ctx, doc, observations, true).results.find(r => r.id === 'CON-01')?.status).toBe('pending');
  });

  it('confirms intersecting text ink on a sheet, independently of roles', () => {
    const layout = inspect(`<div class="page">${text('a')}${text('b')}</div>`);
    expect(layout.content.filter(c => c.kind === 'text').every(c => c.certainty === 'measured')).toBeTrue();
    expect(detectContentConflicts(layout).some(c => c.kind === 'overlap' && c.status === 'fail')).toBeTrue();
  });
  it('does not confuse large text boxes or whitespace with printed ink', () => {
    const layout = inspect(`<div class="page">${text('a', 'A', 'width:250px;height:100px;')}${text('b', 'B', 'left:150px;')}</div>`);
    expect(detectContentConflicts(layout)).toEqual([]);
  });
  it('accepts text within a border and an opaque background behind it', () => {
    const layout = inspect(`<div class="page"><div data-render-element="box" style="position:absolute;left:10px;top:10px;width:150px;height:80px;border:1px solid black;background:white;z-index:0"></div>${text('a', 'Texto', 'z-index:1;')}</div>`);
    expect(detectContentConflicts(layout)).toEqual([]);
  });
  it('confirms an opaque foreground covering text, but ignores invisible elements', () => {
    const layout = inspect(`<div class="page">${text('a')}<div data-render-element="cover" style="position:absolute;left:15px;top:15px;width:100px;height:50px;background:white;z-index:2"></div>${text('hidden', 'MMMM', 'display:none;')}</div>`);
    const conflicts = detectContentConflicts(layout);
    expect(conflicts.some(c => c.status === 'fail')).toBeTrue();
    expect(layout.content.some(c => c.elementId === 'hidden')).toBeFalse();
  });
  it('reports clipped ink and treats unresolved graphics as potential conflicts', () => {
    const layout = inspect(`<div class="page">${text('a', 'MMMMMMMM', 'width:15px;overflow:hidden;white-space:nowrap;')}<canvas style="position:absolute;left:20px;top:20px;width:100px;height:50px"></canvas></div>`);
    expect(detectContentConflicts(layout).some(c => c.kind === 'clipped' && c.status === 'fail')).toBeTrue();
    expect(detectContentConflicts(layout).some(c => c.kind === 'overlap' && c.status === 'pending')).toBeTrue();
  });
  it('keeps repeated IDs on separate pages distinct and retains intermediate page conflicts', () => {
    const layout = inspect(`<div class="page">${text('same')}</div><div class="page">${text('same')}${text('other')}</div><div class="page">${text('same')}</div>`);
    const conflicts = detectContentConflicts(layout);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].page).toBe(2);
    expect(new Set(layout.content.map(c => c.instanceId)).size).toBe(layout.content.length);
  });
  it('retains independent fiscal checks for each rendered page without a global multipage approval', () => {
    const doc = documentFor('<div class="page" data-render-page="1"></div><div class="page" data-render-page="2"></div>');
    const ctx = buildValidationContext(undefined, { invoice: {}, company: {}, invoiceLines: [], fiscal: { schemaVersion: '1.0', isCfe: true, cfeType: 111 } });
    const report = inspectFiscalPrint(createDefaultTemplate(), ctx, doc, evidence, true);
    const checks = report.results.filter(r => r.id === 'QR-03');
    expect(checks.map(r => r.page)).toEqual([1, 2]);
    expect(new Set(report.results.map(r => r.findingId)).size).toBe(report.results.length);
    expect(report.results.filter(r => r.id === 'EXT-03').every(r => r.status !== 'pass')).toBeTrue();
  });
  it('does not claim a geometry result before resources finish', () => {
    const doc = documentFor(`<div class="page">${text('a')}${text('b')}</div>`);
    const layout = inspectRenderedLayout(doc, evidence, { resourcesReady: false });
    expect(detectContentConflicts(layout)).toEqual([]);
    expect(layout.pending.length).toBeGreaterThan(0);
  });
  it('publishes confirmed technical findings as print-failure candidates', () => {
    const doc = documentFor(`<div class="page">${text('a')}${text('b')}</div>`);
    const template = createDefaultTemplate();
    const report = inspectFiscalPrint(template, buildValidationContext(undefined, SAMPLE_INVOICE_MULTILINE), doc, evidence, true);
    const conflicts = report.results.filter(r => r.ruleId === 'TEC-OVERLAP');
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].category).toBe('technical');
    expect(conflicts[0].status).toBe('fail');
    expect(conflicts[0].evidenceIds.length).toBe(2);
    expect(conflicts[0].message).toContain('Página 1');
    expect(confirmedPrintFailures(report).some(f => f.ruleId === 'TEC-OVERLAP')).toBeTrue();
  });
  it('measures wrapped dynamic text without treating line gaps as ink', () => {
    const layout = inspect(`<div class="page">${text('a', 'MMMM MMMM MMMM', 'width:60px;white-space:normal;')}${text('b', 'MMMM', 'top:38px;')}</div>`);
    expect(layout.content.find(c => c.elementId === 'a')!.certainty).toBe('measured');
    expect(detectContentConflicts(layout).some(c => c.status === 'fail')).toBeTrue();
  });
  it('checks image alpha rather than treating a transparent image as an opaque cover', async () => {
    const doc = documentFor(`<div class="page">${text('a')}<img style="position:absolute;left:20px;top:20px;width:100px;height:50px"></div>`);
    const image = doc.querySelector('img')!;
    const canvas = doc.createElement('canvas'); canvas.width = 10; canvas.height = 10;
    image.src = canvas.toDataURL(); await image.decode();
    let layout = inspectRenderedLayout(doc, evidence, { resourcesReady: true });
    expect(detectContentConflicts(layout)).toEqual([]);
    canvas.getContext('2d')!.fillRect(0, 0, 10, 10);
    image.src = canvas.toDataURL(); await image.decode();
    layout = inspectRenderedLayout(doc, evidence, { resourcesReady: true });
    expect(detectContentConflicts(layout).some(c => c.status === 'fail')).toBeTrue();
  });
  it('inspects generated ticket content and preserves source paths', () => {
    const template = createDefaultTemplate();
    template.page.dynamicHeight = true;
    template.sections.header.elements = [];
    template.sections.footer.elements = [];
    const artifact = TestBed.inject(HtmlRendererService).renderWithEvidence(template, SAMPLE_INVOICE_MULTILINE, true);
    const doc = documentFor('');
    doc.open(); doc.write(artifact.html); doc.close();
    const layout = inspectRenderedLayout(doc, artifact.evidence, { resourcesReady: true });
    expect(layout.content.some(c => c.sourcePaths.includes('invoiceLines.0.SubTotal'))).toBeTrue();
    expect(detectContentConflicts(layout).filter(c => c.status === 'fail')).toEqual([]);
    coverContent(doc, doc.querySelector('.ticket-item-name')!);
    const covered = inspectRenderedLayout(doc, artifact.evidence, { resourcesReady: true });
    expect(detectContentConflicts(covered).some(c => c.status === 'fail' && c.contentIds.some(id =>
      covered.content.find(content => content.instanceId === id)?.sourcePaths.includes('invoiceLines.0.Articulo.Nombre')))).toBeTrue();
  });
  it('inspects every sheet after actual renderer pagination', () => {
    const template = createDefaultTemplate();
    template.sections.header.elements = [];
    template.sections.footer.elements = [];
    template.sections.detail.elements = [];
    template.sections.detail.maxRowsPerPage = 2;
    const artifact = TestBed.inject(HtmlRendererService).renderWithEvidence(template, SAMPLE_INVOICE_MULTILINE, true);
    const doc = documentFor('');
    doc.open(); doc.write(artifact.html); doc.close();
    const pagination = paginateFiscalPrint(doc, template);
    const layout = inspectRenderedLayout(doc, artifact.evidence, { resourcesReady: true });
    expect(pagination.pages).toBeGreaterThan(1);
    expect(new Set(layout.content.map(c => c.page)).size).toBe(pagination.pages);
    expect(detectContentConflicts(layout).filter(c => c.status === 'fail')).toEqual([]);
    const secondPage = doc.querySelectorAll('.page')[1];
    coverContent(doc, secondPage.querySelector('.dc-nom')!);
    const covered = inspectRenderedLayout(doc, artifact.evidence, { resourcesReady: true });
    expect(detectContentConflicts(covered).some(c => c.page === 2 && c.status === 'fail')).toBeTrue();
  });
});
