import { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { DesignCanvasComponent } from './design-canvas.component';
import { ValidationSessionService } from '../../services/validation-session.service';
import { TemplateStateService } from '../../services/template-state.service';
import { SelectionService } from '../../services/selection.service';

describe('Design canvas surface revision boundaries', () => {
  let component: DesignCanvasComponent;
  let state: TemplateStateService;
  let frame: HTMLIFrameElement;
  let pending: BehaviorSubject<boolean>;

  beforeEach(() => {
    pending = new BehaviorSubject(false);
    TestBed.configureTestingModule({ providers: [{ provide: ValidationSessionService, useValue: {
      surface$: new BehaviorSubject(''), pending$: pending,
      pagination$: new BehaviorSubject({ pages: 1, resourcesReady: true }),
      beginInteraction: () => pending.next(true), endInteraction: () => {}
    } }] });
    state = TestBed.inject(TemplateStateService);
    component = TestBed.runInInjectionContext(() => new DesignCanvasComponent(state,
      TestBed.inject(SelectionService), { markForCheck: () => {} } as ChangeDetectorRef, TestBed.inject(NgZone)));
    component.ngOnInit();
    frame = document.createElement('iframe');
    document.body.append(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write('<div class="page" style="width:794px;height:1100px"><div class="section-header"></div><div class="section-detail"></div><div class="section-footer"></div></div>');
    doc.close();
    component.renderFrame = new ElementRef(frame);
    component.canvasPage = new ElementRef(document.createElement('div'));
  });

  afterEach(() => { component.ngOnDestroy(); frame.remove(); });

  it('discards an old surface when the template changes while resources are loading', async () => {
    let release!: () => void;
    const ready = new Promise<void>(resolve => release = resolve);
    Object.defineProperty(frame.contentDocument!.fonts, 'ready', { value: ready, configurable: true });
    const loading = component.loadSurface();
    state.updatePageSettings({ width: 148 });
    release();
    await loading;
    expect(component.surfaceReady).toBeFalse();
    await component.loadSurface();
    expect(component.surfaceReady).toBeTrue();
  });

  it('disables editing of the previous surface while a scenario is being prepared', () => {
    component.surfaceReady = true;
    pending.next(true);
    expect(component.surfaceReady).toBeFalse();
  });

  it('keeps the live editing layer available during an active drag', () => {
    component.surfaceReady = true;
    const begin = spyOn(TestBed.inject(ValidationSessionService), 'beginInteraction').and.callThrough();
    const element = state.getCurrentTemplate().sections.header.elements.find(item => !item.locked)!;
    component.onElementDragStart({ elementId: element.id, section: 'header', mouseEvent: new MouseEvent('mousedown') });
    expect(component.dragState).not.toBeNull();
    expect(begin).not.toHaveBeenCalled();
    pending.next(true);
    expect(component.surfaceReady).toBeTrue();
  });
});
