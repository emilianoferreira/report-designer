import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ValidationSessionService } from './validation-session.service';
import { TemplateStateService } from './template-state.service';
import { SAMPLE_INVOICE_DATA } from '../data/sample-invoice';
import { HtmlRendererService } from './html-renderer.service';
import { createDefaultTemplate } from '../data/default-template';
import { createElement } from '../utils/element-factory';

describe('Designer validation session', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [ValidationSessionService] }));
  it('imports data without persisting it or changing history, and rejects malformed envelopes', fakeAsync(() => {
    const state = TestBed.inject(TemplateStateService);
    const before = JSON.stringify(state.getCurrentTemplate());
    const session = TestBed.inject(ValidationSessionService);
    expect(() => session.importJson('{')).toThrow();
    expect(() => session.importJson('{"invoice":[],"company":{},"invoiceLines":[]}')).toThrow();
    session.importJson(JSON.stringify(SAMPLE_INVOICE_DATA));
    expect(session.scenario$.value).toBe('json');
    expect(session.data()).toEqual(SAMPLE_INVOICE_DATA);
    expect(JSON.stringify(state.getCurrentTemplate())).toBe(before);
    expect(state.canUndo).toBeFalse();
    session.ngOnDestroy(); tick(400);
  }));
  it('invalidates findings immediately on edits and debounces work', fakeAsync(() => {
    const renderer = TestBed.inject(HtmlRendererService);
    const render = spyOn(renderer, 'renderWithEvidence').and.callThrough();
    const session = TestBed.inject(ValidationSessionService);
    const state = TestBed.inject(TemplateStateService);
    const template = state.getCurrentTemplate();
    state.setTemplate({ ...template }); tick(100);
    session.select('multi'); tick(100);
    expect(session.report$.value).toBeUndefined();
    expect(session.pending$.value).toBeTrue();
    expect(render).not.toHaveBeenCalled();
    session.ngOnDestroy(); tick(500);
    expect(render).not.toHaveBeenCalled();
  }));
  it('discards a render when the scenario changes during its preparation', async () => {
    const renderer = TestBed.inject(HtmlRendererService);
    const original = renderer.renderWithEvidence.bind(renderer);
    let session: ValidationSessionService;
    let first = true;
    spyOn(renderer, 'renderWithEvidence').and.callFake((template, data, printSurface) => {
      if (first) { first = false; session.select('multi'); }
      return original(template, data, printSurface);
    });
    session = TestBed.inject(ValidationSessionService);
    await new Promise(resolve => setTimeout(resolve, 420));
    expect(first).toBeFalse();
    expect(session.scenario$.value).toBe('multi');
    expect(session.report$.value).toBeUndefined();
    expect(session.pending$.value).toBeTrue();
    session.ngOnDestroy();
  });
  it('suspends expensive inspection while dragging, without changing the scenario data', fakeAsync(() => {
    const renderer = TestBed.inject(HtmlRendererService);
    const render = spyOn(renderer, 'renderWithEvidence').and.callThrough();
    const session = TestBed.inject(ValidationSessionService);
    const data = session.data();
    session.beginInteraction(); tick(800);
    expect(render).not.toHaveBeenCalled();
    expect(session.report$.value).toBeUndefined();
    session.endInteraction(); tick(100);
    expect(session.data()).toBe(data);
    session.ngOnDestroy(); tick(500);
  }));
  it('publishes content feedback and highlights confirmed fields, then clears both immediately on scenario changes', async () => {
    const template = createDefaultTemplate(), element = createElement('dataField');
    if (element.type !== 'dataField') throw new Error('Unexpected element');
    element.id = 'price'; element.position = { x: 2, y: 2 }; element.size = { width: 60, height: 8 };
    element.binding = { source: 'fiscal.totalAmount', format: { type: 'currency', currencyCode: 'USD', decimals: 2 } }; element.fiscalRoles = ['totals.amount'];
    template.sections.header.elements = [element]; template.sections.detail.elements = []; template.sections.footer.elements = [];
    template.sections.header.height = 50; template.sections.detail.height = 40; template.sections.footer.height = 20;
    template.compliance = { schemaVersion: '1.0', jurisdiction: 'UY', output: 'browser', cfeType: 111, medium: 'sheet' };
    TestBed.inject(TemplateStateService).setTemplate(template);
    const session = TestBed.inject(ValidationSessionService);
    session.importJson(JSON.stringify({ invoice: {}, company: {}, invoiceLines: [], fiscal: { schemaVersion: '1.0', isCfe: true, cfeType: 111, currency: 'UYU', totalAmount: '100', totalPayable: '100' } }));
    for (let count = 0; count < 30 && session.pending$.value; count++) await new Promise(resolve => setTimeout(resolve, 50));
    expect(session.feedback$.value?.state).toBe('block'); expect(session.affected('price')).toBe('error');
    expect(session.feedback$.value?.groups.find(group => group.key === 'amounts')?.findings.some(item => item.finding.ruleId === 'AMT-CURRENCY' && item.blocking)).toBeTrue();
    session.select('single');
    expect(session.feedback$.value).toBeUndefined(); expect(session.report$.value).toBeUndefined(); expect(session.affected('price')).toBeUndefined();
    session.ngOnDestroy();
  });
});
