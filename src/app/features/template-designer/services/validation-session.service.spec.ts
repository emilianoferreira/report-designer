import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ValidationSessionService } from './validation-session.service';
import { TemplateStateService } from './template-state.service';
import { SAMPLE_INVOICE_DATA } from '../data/sample-invoice';
import { HtmlRendererService } from './html-renderer.service';

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
});
