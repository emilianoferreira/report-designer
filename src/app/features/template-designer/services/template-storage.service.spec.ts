/**
 * TemplateStorageService Tests
 * Tests localStorage fallback mode (no API available)
 */
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TemplateStorageService } from './template-storage.service';

describe('TemplateStorageService', () => {
  let service: TemplateStorageService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.removeItem('zureo_template_molds');

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(TemplateStorageService);
    httpMock = TestBed.inject(HttpTestingController);

    // The init() call tries GET /api/templates — make it fail so we use localStorage
    const initReq = httpMock.expectOne(req => req.url.includes('/api/templates'));
    initReq.error(new ProgressEvent('error'));
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem('zureo_template_molds');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with empty molds', () => {
    expect(service.getAll().length).toBe(0);
  });

  // ─── Create ───

  it('should create a mold with name, type, and description', async () => {
    const mold = await service.create('Test Mold', 'venta_contado', 'A test description');
    expect(mold).toBeTruthy();
    expect(mold.id).toBeTruthy();
    expect(mold.name).toBe('Test Mold');
    expect(mold.documentType).toBe('venta_contado');
    expect(mold.description).toBe('A test description');
    expect(mold.template).toBeTruthy();
    expect(mold.template.schemaVersion).toBe('1.0');
  });

  it('should persist created mold to localStorage', async () => {
    await service.create('Persisted', 'remito');
    const raw = localStorage.getItem('zureo_template_molds');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe('Persisted');
  });

  it('should emit updated molds via observable', (done) => {
    service.create('Observable Test', 'venta_contado').then(() => {
      service.molds$.subscribe(molds => {
        if (molds.length > 0) {
          expect(molds[0].name).toBe('Observable Test');
          done();
        }
      });
    });
  });

  it('should sync template metadata with mold name', async () => {
    const mold = await service.create('Synced Name', 'cotizacion');
    expect(mold.template.metadata.name).toBe('Synced Name');
  });

  // ─── Read ───

  it('should get a mold by ID', async () => {
    const created = await service.create('Find Me', 'venta_contado');
    const found = service.getById(created.id);
    expect(found).toBeTruthy();
    expect(found!.name).toBe('Find Me');
  });

  it('should return undefined for non-existent ID', () => {
    expect(service.getById('nonexistent')).toBeUndefined();
  });

  // ─── Update Metadata ───

  it('should update mold metadata', async () => {
    const mold = await service.create('Original', 'venta_contado');
    const updated = await service.updateMetadata(mold.id, {
      name: 'Updated Name',
      documentType: 'nota_credito'
    });
    expect(updated).toBeTruthy();
    expect(updated!.name).toBe('Updated Name');
    expect(updated!.documentType).toBe('nota_credito');
    expect(updated!.updatedAt).toBeTruthy();
  });

  it('should sync template name when updating mold name', async () => {
    const mold = await service.create('Before', 'venta_contado');
    const updated = await service.updateMetadata(mold.id, { name: 'After' });
    expect(updated!.template.metadata.name).toBe('After');
  });

  it('should return undefined when updating non-existent mold', async () => {
    const result = await service.updateMetadata('nonexistent', { name: 'Nope' });
    expect(result).toBeUndefined();
  });

  // ─── Save Template ───

  it('should save a template into a mold', async () => {
    const mold = await service.create('Template Save', 'venta_contado');
    const template = { ...mold.template, metadata: { ...mold.template.metadata, version: 99 } };
    const updated = await service.saveTemplate(mold.id, template);
    expect(updated).toBeTruthy();
    expect(updated!.template.metadata.version).toBe(99);
  });

  // ─── Delete ───

  it('should delete a mold', async () => {
    const mold = await service.create('To Delete', 'venta_contado');
    expect(service.getAll().length).toBe(1);
    const result = await service.delete(mold.id);
    expect(result).toBeTrue();
    expect(service.getAll().length).toBe(0);
  });

  it('should return false when deleting non-existent mold', async () => {
    const result = await service.delete('nonexistent');
    expect(result).toBeFalse();
  });

  // ─── Duplicate ───

  it('should duplicate a mold with new ID and name', async () => {
    const original = await service.create('Original Mold', 'venta_contado', 'Desc');
    const cloned = await service.duplicate(original.id);
    expect(cloned).toBeTruthy();
    expect(cloned!.id).not.toBe(original.id);
    expect(cloned!.name).toBe('Original Mold (copia)');
    expect(cloned!.description).toBe('Desc');
    expect(cloned!.documentType).toBe('venta_contado');
    expect(service.getAll().length).toBe(2);
  });

  it('should return undefined when duplicating non-existent mold', async () => {
    const result = await service.duplicate('nonexistent');
    expect(result).toBeUndefined();
  });

  // ─── Multiple molds ───

  it('should handle multiple molds', async () => {
    await service.create('Mold 1', 'venta_contado');
    await service.create('Mold 2', 'remito');
    await service.create('Mold 3', 'nota_credito');
    expect(service.getAll().length).toBe(3);
  });
});
