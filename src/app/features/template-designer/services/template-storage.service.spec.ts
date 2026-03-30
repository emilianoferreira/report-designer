/**
 * TemplateStorageService Tests
 */
import { TestBed } from '@angular/core/testing';
import { TemplateStorageService } from './template-storage.service';

describe('TemplateStorageService', () => {
  let service: TemplateStorageService;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.removeItem('zureo_template_molds');

    TestBed.configureTestingModule({});
    service = TestBed.inject(TemplateStorageService);
  });

  afterEach(() => {
    localStorage.removeItem('zureo_template_molds');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with empty molds', () => {
    expect(service.getAll().length).toBe(0);
  });

  // ─── Create ───

  it('should create a mold with name, type, and description', () => {
    const mold = service.create('Test Mold', 'venta_contado', 'A test description');
    expect(mold).toBeTruthy();
    expect(mold.id).toBeTruthy();
    expect(mold.name).toBe('Test Mold');
    expect(mold.documentType).toBe('venta_contado');
    expect(mold.description).toBe('A test description');
    expect(mold.companyId).toBe('default');
    expect(mold.template).toBeTruthy();
    expect(mold.template.schemaVersion).toBe('1.0');
  });

  it('should persist created mold to localStorage', () => {
    service.create('Persisted', 'remito');
    const raw = localStorage.getItem('zureo_template_molds');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe('Persisted');
  });

  it('should emit updated molds via observable', (done) => {
    service.create('Observable Test', 'venta_contado');
    service.molds$.subscribe(molds => {
      if (molds.length > 0) {
        expect(molds[0].name).toBe('Observable Test');
        done();
      }
    });
  });

  it('should sync template metadata with mold name', () => {
    const mold = service.create('Synced Name', 'cotizacion');
    expect(mold.template.metadata.name).toBe('Synced Name');
  });

  // ─── Read ───

  it('should get a mold by ID', () => {
    const created = service.create('Find Me', 'venta_contado');
    const found = service.getById(created.id);
    expect(found).toBeTruthy();
    expect(found!.name).toBe('Find Me');
  });

  it('should return undefined for non-existent ID', () => {
    expect(service.getById('nonexistent')).toBeUndefined();
  });

  // ─── Update Metadata ───

  it('should update mold metadata', () => {
    const mold = service.create('Original', 'venta_contado');
    const updated = service.updateMetadata(mold.id, {
      name: 'Updated Name',
      documentType: 'nota_credito'
    });
    expect(updated).toBeTruthy();
    expect(updated!.name).toBe('Updated Name');
    expect(updated!.documentType).toBe('nota_credito');
    // updatedAt may or may not differ due to timing; just check it exists
    expect(updated!.updatedAt).toBeTruthy();
  });

  it('should sync template name when updating mold name', () => {
    const mold = service.create('Before', 'venta_contado');
    const updated = service.updateMetadata(mold.id, { name: 'After' });
    expect(updated!.template.metadata.name).toBe('After');
  });

  it('should return undefined when updating non-existent mold', () => {
    expect(service.updateMetadata('nonexistent', { name: 'Nope' })).toBeUndefined();
  });

  // ─── Save Template ───

  it('should save a template into a mold', () => {
    const mold = service.create('Template Save', 'venta_contado');
    const template = { ...mold.template, metadata: { ...mold.template.metadata, version: 99 } };
    const updated = service.saveTemplate(mold.id, template);
    expect(updated).toBeTruthy();
    expect(updated!.template.metadata.version).toBe(99);
  });

  // ─── Delete ───

  it('should delete a mold', () => {
    const mold = service.create('To Delete', 'venta_contado');
    expect(service.getAll().length).toBe(1);
    const result = service.delete(mold.id);
    expect(result).toBeTrue();
    expect(service.getAll().length).toBe(0);
  });

  it('should return false when deleting non-existent mold', () => {
    expect(service.delete('nonexistent')).toBeFalse();
  });

  // ─── Duplicate ───

  it('should duplicate a mold with new ID and name', () => {
    const original = service.create('Original Mold', 'venta_contado', 'Desc');
    const cloned = service.duplicate(original.id);
    expect(cloned).toBeTruthy();
    expect(cloned!.id).not.toBe(original.id);
    expect(cloned!.name).toBe('Original Mold (copia)');
    expect(cloned!.description).toBe('Desc');
    expect(cloned!.documentType).toBe('venta_contado');
    expect(service.getAll().length).toBe(2);
  });

  it('should return undefined when duplicating non-existent mold', () => {
    expect(service.duplicate('nonexistent')).toBeUndefined();
  });

  // ─── Multiple molds ───

  it('should handle multiple molds', () => {
    service.create('Mold 1', 'venta_contado');
    service.create('Mold 2', 'remito');
    service.create('Mold 3', 'nota_credito');
    expect(service.getAll().length).toBe(3);
  });
});
