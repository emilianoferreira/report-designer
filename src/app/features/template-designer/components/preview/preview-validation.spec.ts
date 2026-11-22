import { ChangeDetectorRef, ElementRef } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { PreviewComponent } from './preview.component';
import { ValidationSessionService } from '../../services/validation-session.service';
import { TemplateStateService } from '../../services/template-state.service';
import { HtmlRendererService } from '../../services/html-renderer.service';
import { SelectionService } from '../../services/selection.service';
import { createDefaultTemplate } from '../../data/default-template';
import { createElement } from '../../utils/element-factory';
import { InvoiceData } from '../../../../core/models/template.model';
import { FiscalRole } from '../../../../core/models/fiscal.model';

describe('Content feedback and actual preview print boundary', () => {
  let frame: HTMLIFrameElement, component: PreviewComponent, state: TemplateStateService, renderer: HtmlRendererService;
  let data: InvoiceData;
  beforeEach(() => {
    data = { invoice: {}, company: {}, invoiceLines: [], fiscal: { schemaVersion: '1.0', isCfe: true, cfeType: 112,
      finalConsumer: false, receiverDocumentType: 'RUC', receiverName: 'Empresa Receptora', receiverAddress: 'Domicilio',
      receiverDocumentNumber: '219876540012', receiverNonResidentWithoutRut: false, professionalSecrecy: false,
      receiverSectorException: false, exportOperation: false, currency: 'UYU', totalAmount: '100', totalPayable: '100',
      references: [{ global: false, cfeType: 111, cfeTypeName: 'e-Factura', series: 'A', number: '123' }], referencesComplete: true } };
    TestBed.configureTestingModule({ providers: [{ provide: ValidationSessionService, useValue: { scenario$: new BehaviorSubject('json'), data: () => data } }] });
    state = TestBed.inject(TemplateStateService); renderer = TestBed.inject(HtmlRendererService);
    const template = createDefaultTemplate();
    template.compliance = { schemaVersion: '1.0', jurisdiction: 'UY', output: 'browser', cfeType: 112, medium: 'sheet' };
    template.sections.header.elements = (['receiverName', 'totalAmount', 'references.0.series'] as const).map((field, index) => {
      const element = createElement('dataField'); if (element.type !== 'dataField') throw new Error('Unexpected element');
      element.id = 'content-' + index; element.binding = { source: 'fiscal.' + field };
      element.fiscalRoles = [(['recipient.name', 'totals.amount', 'reference.series'] as FiscalRole[])[index]];
      element.position = { x: 2, y: 2 + index * 12 }; element.size = { width: 60, height: 8 }; return element;
    });
    template.sections.detail.elements = []; template.sections.footer.elements = [];
    template.sections.header.height = 50; template.sections.detail.height = 40; template.sections.footer.height = 20;
    state.setTemplate(template);
    frame = document.createElement('iframe'); document.body.append(frame);
    component = TestBed.runInInjectionContext(() => new PreviewComponent(state, renderer,
      { markForCheck: () => {} } as ChangeDetectorRef, TestBed.inject(SelectionService)));
    component.previewFrame = new ElementRef(frame);
  });
  afterEach(() => { component.ngOnDestroy(); frame.remove(); });
  const prepared = async () => {
    component.ngOnInit();
    await (component as unknown as { preparation: Promise<Document> }).preparation;
  };
  it('reinspects each family in the actual print document despite an earlier allowed report', async () => {
    await prepared();
    const print = spyOn(frame.contentWindow!, 'print');
    expect(component.feedback?.state).toBe('allow');
    await component.printPreview(); expect(print).toHaveBeenCalledTimes(1);
    const originals = ['Empresa Receptora', '100', 'A'];
    for (const [index, rule] of ['REC-FIELD.name', 'AMT-FIELD', 'REF-FIELD'].entries()) {
      const node = frame.contentDocument!.querySelector(`[data-render-element="content-${index}"]`)!;
      node.textContent = index === 0 ? 'Otra Empresa' : index === 1 ? '99' : 'B';
      await component.printPreview();
      expect(component.printMessage).toContain(rule); expect(component.feedback?.state).toBe('block');
      expect(print).toHaveBeenCalledTimes(1); node.textContent = originals[index];
    }
    await component.printPreview(); expect(print).toHaveBeenCalledTimes(2); expect(component.feedback?.state).toBe('allow');
  });
  it('withdraws feedback before the edit debounce and does not authorize an outdated artifact', async () => {
    await prepared(); const old = component.renderInputSnapshot;
    state.setTemplate({ ...state.getCurrentTemplate(), metadata: { ...state.getCurrentTemplate().metadata, name: 'Actual' } });
    expect(component.renderedReport).toBeUndefined(); expect(component.feedback).toBeUndefined(); expect(component.previewReady).toBeFalse();
    const print = spyOn(frame.contentWindow!, 'print'); await component.printPreview();
    expect(component.renderInputSnapshot).not.toBe(old); expect(print).toHaveBeenCalledTimes(1);
  });
  it('keeps composite or hidden DOM text pending across the feedback and all three print controls', async () => {
    await prepared();
    const print = spyOn(frame.contentWindow!, 'print');
    for (const node of Array.from(frame.contentDocument!.querySelectorAll('[data-render-element^="content-"]'))) {
      const hidden = frame.contentDocument!.createElement('span');
      hidden.hidden = true; hidden.textContent = '9'; node.append(hidden);
    }
    await component.printPreview();
    expect(print).toHaveBeenCalledTimes(1);
    for (const path of ['receiverName', 'totalAmount', 'references.0.series']) {
      const items = component.feedback!.groups.flatMap(group => group.findings).filter(item => item.finding.fieldPath === path);
      expect(items.length).withContext(path).toBeGreaterThan(0);
      expect(items.every(item => item.finding.status === 'pending')).withContext(path).toBeTrue();
    }
  });
  it('prepares again when undo restores the same snapshot during the debounce', async () => {
    await prepared(); const original = state.getCurrentTemplate();
    state.setTemplate({ ...original, metadata: { ...original.metadata, name: 'Temporal' } });
    state.setTemplate(original);
    const print = spyOn(frame.contentWindow!, 'print'); await component.printPreview();
    expect(print).toHaveBeenCalledTimes(1);
    expect(component.feedback?.state).toBe('allow');
  });
  it('exports current Zureo directives independently of a blocked or pending browser report', async () => {
    await prepared();
    spyOn(frame.contentWindow!, 'print');
    frame.contentDocument!.querySelector('[data-render-element="content-1"]')!.textContent = '99'; await component.printPreview();
    expect(component.feedback?.state).toBe('block');
    state.setTemplate({ ...state.getCurrentTemplate(), metadata: { ...state.getCurrentTemplate().metadata, name: 'Exportación actual' } });
    const download = spyOn(component as any, 'downloadBlob'); component.templateHtml = 'stale'; component.exportHtmlTemplate();
    expect(download.calls.mostRecent().args[0]).toBe(renderer.exportAsZureoTemplate(state.getCurrentTemplate()));
    expect(download.calls.mostRecent().args[0]).toContain('z-code');
    const copy = spyOn(component as any, 'copyToClipboard').and.returnValue(Promise.resolve()); await component.copyHtmlTemplate();
    expect(copy).toHaveBeenCalledWith(renderer.exportAsZureoTemplate(state.getCurrentTemplate()));
  });
  it('does not duplicate concurrent prints and keeps pending controls nonblocking', async () => {
    await prepared(); const print = spyOn(frame.contentWindow!, 'print');
    expect(component.renderedReport!.results.some(result => result.status === 'pending')).toBeTrue();
    await Promise.all([component.printPreview(), component.printPreview()]); expect(print).toHaveBeenCalledTimes(1);
  });
  it('cancels a debounced refresh on teardown instead of rendering a destroyed preview', fakeAsync(() => {
    const render = spyOn(renderer, 'renderWithEvidence').and.callThrough();
    component.ngOnInit(); state.setTemplate({ ...state.getCurrentTemplate() });
    component.ngOnDestroy(); tick(400); expect(render).toHaveBeenCalledTimes(1);
  }));
});
