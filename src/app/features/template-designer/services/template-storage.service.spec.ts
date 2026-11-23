import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TemplateStorageService } from './template-storage.service';
import { AuthService } from '../../../core/auth/auth.service';
import { createDefaultTemplate } from '../data/default-template';

describe('TemplateStorageService authenticated persistence', () => {
  let service: TemplateStorageService;
  let http: HttpTestingController;
  const row = () => ({ id:'owned', company_id:'company-a', nombre:'Reporte', descripcion:'', version:null,
    template_json:{documentType:'venta_contado',template:createDefaultTemplate()} });
  beforeEach(() => {
    localStorage.setItem('zureo_template_molds', JSON.stringify([{id:'private',name:'Private cache'}]));
    TestBed.configureTestingModule({ imports:[HttpClientTestingModule],
      providers:[{provide:AuthService,useValue:{session:{company_id:'company-a'}}}] });
    service=TestBed.inject(TemplateStorageService); http=TestBed.inject(HttpTestingController);
  });
  afterEach(() => {http.verify();localStorage.removeItem('zureo_template_molds');});
  it('round trips legacy JSON without injecting fiscal defaults', async () => {
    const original = row();
    http.expectOne('/api/templates').flush([original]); await service.ready;
    const mold = service.getById('owned')!;
    const pending = service.saveTemplate(mold, mold.template);
    const request = http.expectOne('/api/templates/owned/design');
    expect(request.request.body.template_json).toEqual(original.template_json);
    expect(request.request.headers.get('If-Match')).toBe('"0"');
    expect('compliance' in request.request.body.template_json.template).toBeFalse();
    request.flush(original); await pending;
  });
  it('preserves fiscal metadata and unknown extensions through save, load and duplication', async () => {
    const original = row();
    const template = original.template_json.template;
    template.compliance = { schemaVersion: '1.0', jurisdiction: 'UY', output: 'browser', cfeType: 112 };
    template.sections.header.elements[0].fiscalRoles = ['reference.reason'];
    Object.assign(template.compliance, { futureOption: { keep: true } });
    Object.assign(template, { futureExtension: { keep: true } });
    http.expectOne('/api/templates').flush([original]); await service.ready;
    const mold = service.getById('owned')!;
    const pending = service.saveTemplate(mold, mold.template);
    const request = http.expectOne('/api/templates/owned/design');
    expect(request.request.body.template_json.template).toEqual(template);
    expect(request.request.body.template_json.template.fiscal).toBeUndefined();
    request.flush(original); await pending;
    const duplicate = service.duplicate('owned');
    http.expectOne('/api/templates/owned/duplicate').flush({ ...original, id: 'copy' });
    expect((await duplicate)!.template).toEqual(template);
  });
  it('updates the report type and metadata together, preserving the original design and JSON envelope', async () => {
    const original = row();
    http.expectOne('/api/templates').flush([original]); await service.ready;
    const design = { ...original.template_json, extension: { keep: true } };
    Object.assign(design.template, { futureExtension: { keep: true } });
    const saving = service.updateMetadata('owned', {
      name: 'Factura a crédito', description: 'Actualizada', documentType: 'venta_credito'
    }, 0);
    http.expectOne({ method: 'GET', url: '/api/templates/owned' }).flush({ ...original, template_json: design });
    await Promise.resolve();
    const request = http.expectOne({ method: 'PUT', url: '/api/templates/owned' });
    const expected = { nombre: 'Factura a crédito', descripcion: 'Actualizada',
      template_json: { ...design, documentType: 'venta_credito' } };
    expect(request.request.body).toEqual(expected);
    expect(request.request.headers.get('If-Match')).toBe('"0"');
    request.flush({ ...original, ...expected, version: 2 });
    expect((await saving)?.documentType).toBe('venta_credito');
    expect(service.getById('owned')?.template).toEqual(design.template);
  });

  it('keeps the submitted revision even when the design read observes a newer revision', async () => {
    const original = { ...row(), version: 3 };
    http.expectOne('/api/templates').flush([original]); await service.ready;
    const saving = service.updateMetadata('owned', { documentType: 'venta_credito' }, 3);
    const rejected = expectAsync(saving).toBeRejectedWith(jasmine.objectContaining({ status: 409 }));
    http.expectOne({ method: 'GET', url: '/api/templates/owned' }).flush({ ...original, version: 4 });
    await Promise.resolve();
    const request = http.expectOne({ method: 'PUT', url: '/api/templates/owned' });
    expect(request.request.headers.get('If-Match')).toBe('"3"');
    request.flush({}, { status: 409, statusText: 'Conflict' });
    await rejected;
    expect(service.getById('owned')?.documentType).toBe('venta_contado');
  });

  it('sends only row metadata when the report type is unchanged', async () => {
    http.expectOne('/api/templates').flush([row()]); await service.ready;
    const saving = service.updateMetadata('owned', { description: 'Nueva', documentType: 'venta_contado' }, 0);
    const request = http.expectOne({ method: 'PUT', url: '/api/templates/owned' });
    expect(request.request.body).toEqual({ nombre: 'Reporte', descripcion: 'Nueva' });
    request.flush({ ...row(), descripcion: 'Nueva', version: 2 });
    await saving;
  });

  it('does not write metadata when the original design cannot be loaded', async () => {
    http.expectOne('/api/templates').flush([row()]); await service.ready;
    const saving = service.updateMetadata('owned', { documentType: 'venta_credito' }, 0);
    const rejected = expectAsync(saving).toBeRejected();
    http.expectOne({ method: 'GET', url: '/api/templates/owned' }).flush({}, { status: 503, statusText: 'Unavailable' });
    await rejected;
    http.expectNone({ method: 'PUT', url: '/api/templates/owned' });
    expect(service.getById('owned')?.documentType).toBe('venta_contado');
  });
  for (const status of [0,401,403,500]) it('never reads cached documents on HTTP '+status, async () => {
    const request=http.expectOne('/api/templates');
    if (status===0) request.error(new ProgressEvent('error')); else request.flush({}, {status,statusText:'Unavailable'});
    await service.ready;
    expect(service.getAll()).toEqual([]);
  });
  it('separates reports from labels returned by the authenticated API', async () => {
    http.expectOne('/api/templates').flush([row(),{...row(),id:'label',template_json:{type:'price-label'}}]);
    await service.ready;expect(service.getAll().map(m=>m.id)).toEqual(['owned']);
  });
  it('preserves the in-memory document and the error when saving is unauthorized', async () => {
    const original=row();http.expectOne('/api/templates').flush([original]);await service.ready;
    const pending=service.saveTemplate(service.getById('owned')!,createDefaultTemplate());
    const rejected=expectAsync(pending).toBeRejected();
    http.expectOne('/api/templates/owned/design').flush({}, {status:401,statusText:'Unauthorized'});
    await rejected;expect(service.getById('owned')!.template).toEqual(original.template_json.template);
    expect(JSON.parse(localStorage.getItem('zureo_template_molds')!)[0].id).toBe('private');
  });
  it('does not manufacture a local document when creation fails', async () => {
    http.expectOne('/api/templates').flush([]);await service.ready;
    const pending=service.create('Nuevo','venta_contado');const rejected=expectAsync(pending).toBeRejected();
    const request=http.expectOne('/api/templates');expect(request.request.body.company_id).toBeUndefined();
    request.flush({}, {status:403,statusText:'Forbidden'});await rejected;expect(service.getAll()).toEqual([]);
  });
  it('does not remove a document from memory when deletion fails', async () => {
    http.expectOne('/api/templates').flush([row()]);await service.ready;
    const pending=service.delete('owned',0);const rejected=expectAsync(pending).toBeRejected();
    http.expectOne('/api/templates/owned').flush({}, {status:403,statusText:'Forbidden'});
    await rejected;expect(service.getById('owned')).toBeDefined();
  });
});
