import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TemplateStorageService } from './template-storage.service';
import { AuthService } from '../../../core/auth/auth.service';
import { createDefaultTemplate } from '../data/default-template';

describe('TemplateStorageService authenticated persistence', () => {
  let service: TemplateStorageService;
  let http: HttpTestingController;
  const row = () => ({ id:'owned', company_id:'company-a', nombre:'Reporte', descripcion:'',
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
    const pending = service.saveTemplate('owned', service.getById('owned')!.template);
    const request = http.expectOne('/api/templates/owned/design');
    expect(request.request.body.template_json).toEqual(original.template_json);
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
    const pending = service.saveTemplate('owned', service.getById('owned')!.template);
    const request = http.expectOne('/api/templates/owned/design');
    expect(request.request.body.template_json.template).toEqual(template);
    expect(request.request.body.template_json.template.fiscal).toBeUndefined();
    request.flush(original); await pending;
    const duplicate = service.duplicate('owned');
    http.expectOne('/api/templates/owned/duplicate').flush({ ...original, id: 'copy' });
    expect((await duplicate)!.template).toEqual(template);
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
    const pending=service.saveTemplate('owned',createDefaultTemplate());
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
    const pending=service.delete('owned');const rejected=expectAsync(pending).toBeRejected();
    http.expectOne('/api/templates/owned').flush({}, {status:403,statusText:'Forbidden'});
    await rejected;expect(service.getById('owned')).toBeDefined();
  });
});
