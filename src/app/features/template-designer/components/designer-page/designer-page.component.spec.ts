import { ChangeDetectorRef } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, convertToParamMap } from '@angular/router';
import { routes } from '../../../../app.routes';
import { AuthService } from '../../../../core/auth/auth.service';
import { createDefaultTemplate } from '../../data/default-template';
import { SelectionService } from '../../services/selection.service';
import { TemplateStateService } from '../../services/template-state.service';
import { TemplateStorageService } from '../../services/template-storage.service';
import { DesignerPageComponent } from './designer-page.component';

describe('DesignerPageComponent report saves', () => {
  const row = { id: 'report', nombre: 'Factura', template_json: {
    documentType: 'venta_contado', template: JSON.parse(JSON.stringify(createDefaultTemplate())) as ReturnType<typeof createDefaultTemplate>
  } };
  const endpoint = '/api/templates/report/design';
  let http: HttpTestingController;
  let storage: TemplateStorageService;
  let state: TemplateStateService;
  let page: DesignerPageComponent;

  function openPage() {
    const component = new DesignerPageComponent(TestBed.inject(AuthService), state,
      TestBed.inject(SelectionService), storage,
      { snapshot: { paramMap: convertToParamMap({ id: row.id }) } } as ActivatedRoute,
      TestBed.inject(Router), jasmine.createSpyObj<ChangeDetectorRef>('cdr', ['markForCheck']));
    component.ngOnInit();
    return component;
  }
  function edit(name: string) {
    const current = state.getCurrentTemplate();
    state.setTemplate({ ...current, metadata: { ...current.metadata, name } });
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { leavingSession: false, session: { role: 'editor' } } }] });
    http = TestBed.inject(HttpTestingController);
    storage = TestBed.inject(TemplateStorageService);
    state = TestBed.inject(TemplateStateService);
    http.expectOne('/api/templates').flush([row]);
    await storage.ready;
    page = openPage();
  });
  afterEach(() => { page.ngOnDestroy(); http.verify(); });

  it('confirms only the sent snapshot, preserves history and reopens the second save', async () => {
    edit('A');
    const firstSave = page.saveTemplate();
    await page.saveTemplate(); // second click before the first response
    const first = http.expectOne({ url: endpoint, method: 'PUT' });
    edit('B');
    expect(first.request.body.template_json.template.metadata.name).toBe('A');
    first.flush({ ...row, template_json: first.request.body.template_json });
    await firstSave;
    expect(page.isDirty).toBeTrue();
    expect(page.hasUnsavedChanges()).toBeTrue();
    expect(state.getCurrentTemplate().metadata.name).toBe('B');
    state.undo();
    expect(page.isDirty).toBeFalse();
    state.redo();
    expect(page.isDirty).toBeTrue();
    const secondSave = page.saveTemplate();
    const second = http.expectOne({ url: endpoint, method: 'PUT' });
    const original = row.template_json.template;
    expect(second.request.body).toEqual({ template_json: { ...row.template_json,
      template: { ...original, metadata: { ...original.metadata, name: 'B' } }
    } });
    second.flush({ ...row, template_json: second.request.body.template_json });
    await secondSave;
    expect(page.hasUnsavedChanges()).toBeFalse();
    page.ngOnDestroy();
    page = openPage();
    expect(state.getCurrentTemplate().metadata.name).toBe('B');
    expect(page.isDirty).toBeFalse();
  });

  it('keeps the current draft on HTTP failure and allows retry', async () => {
    edit('A');
    const failed = page.saveTemplate();
    edit('B');
    http.expectOne(endpoint).flush({}, { status: 503, statusText: 'Unavailable' });
    await failed;
    expect(page.hasUnsavedChanges()).toBeTrue();
    expect(page.saveMessage).toContain('No se pudo guardar');
    const retry = page.saveTemplate();
    const request = http.expectOne(endpoint);
    expect(request.request.body.template_json.template.metadata.name).toBe('B');
    request.flush({ ...row, template_json: request.request.body.template_json });
    await retry;
    expect(page.hasUnsavedChanges()).toBeFalse();
  });

  async function reopenThroughRoute() {
    const route = routes.find(item => item.path === 'designer/:id')!;
    const snapshot = { paramMap: convertToParamMap({ id: row.id }) } as ActivatedRouteSnapshot;
    for (const guard of route.canActivate as CanActivateFn[]) {
      const allowed = await TestBed.runInInjectionContext(() => guard(snapshot, {} as RouterStateSnapshot));
      expect(allowed).toBeTrue();
    }
    page = openPage();
  }

  it('saves the reopened footer together with the header from the outstanding PUT', async () => {
    const original = row.template_json.template;
    const header = { ...original.sections.header, height: original.sections.header.height + 1 };
    const footer = { ...original.sections.footer, height: original.sections.footer.height + 2 };
    state.setTemplate({ ...original, sections: { ...original.sections, header } });
    const savingHeader = page.saveTemplate();
    const first = http.expectOne({ url: endpoint, method: 'PUT' });
    page.ngOnDestroy();
    const reopening = reopenThroughRoute();
    await new Promise(resolve => setTimeout(resolve, 0));
    first.flush({ ...row, template_json: first.request.body.template_json });
    await savingHeader;
    await reopening;
    const reopened = state.getCurrentTemplate();
    state.setTemplate({ ...reopened, sections: { ...reopened.sections, footer } });
    const savingFooter = page.saveTemplate();
    const second = http.expectOne({ url: endpoint, method: 'PUT' });
    const expected = { ...original, sections: { ...original.sections, header, footer } };
    expect(second.request.body).toEqual({ template_json: { ...row.template_json, template: expected } });
    second.flush({ ...row, template_json: second.request.body.template_json });
    await savingFooter;
    expect(storage.getById(row.id)?.template).toEqual(expected);
    expect(page.hasUnsavedChanges()).toBeFalse();
  });

  it('reopens the last confirmed design after an HTTP failure and accepts the next save', async () => {
    edit('A');
    const pending = page.saveTemplate();
    const request = http.expectOne(endpoint);
    page.ngOnDestroy();
    const reopening = reopenThroughRoute();
    await new Promise(resolve => setTimeout(resolve, 0));
    request.flush({}, { status: 503, statusText: 'Unavailable' });
    await pending;
    await reopening;
    expect(state.getCurrentTemplate()).toEqual(row.template_json.template);
    edit('B');
    const retry = page.saveTemplate();
    const second = http.expectOne({ url: endpoint, method: 'PUT' });
    expect(second.request.body.template_json.template.metadata.name).toBe('B');
    second.flush({ ...row, template_json: second.request.body.template_json });
    await retry;
    expect(page.hasUnsavedChanges()).toBeFalse();
  });

  it('protects exit during a pending save and isolates a reopened editor', async () => {
    edit('A');
    const pending = page.saveTemplate();
    const request = http.expectOne(endpoint);
    state.undo();
    expect(page.hasUnsavedChanges()).toBeTrue();
    const event = jasmine.createSpyObj<BeforeUnloadEvent>('beforeunload', ['preventDefault']);
    page.onBeforeUnload(event);
    expect(event.preventDefault).toHaveBeenCalled();
    page.ngOnDestroy();
    page = openPage();
    edit('B');
    await page.saveTemplate();
    http.expectNone(endpoint);
    request.flush({ ...row, template_json: request.request.body.template_json });
    await pending;
    expect(state.getCurrentTemplate().metadata.name).toBe('B');
    expect(page.hasUnsavedChanges()).toBeTrue();
  });
});
