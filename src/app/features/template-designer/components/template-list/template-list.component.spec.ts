/**
 * TemplateListComponent Tests
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TemplateListComponent } from './template-list.component';
import { TemplateStorageService } from '../../services/template-storage.service';

describe('TemplateListComponent', () => {
  let component: TemplateListComponent;
  let fixture: ComponentFixture<TemplateListComponent>;
  let storage: TemplateStorageService;

  beforeEach(async () => {
    localStorage.removeItem('zureo_template_molds');

    await TestBed.configureTestingModule({
      imports: [TemplateListComponent, RouterTestingModule]
    }).compileComponents();

    storage = TestBed.inject(TemplateStorageService);
    fixture = TestBed.createComponent(TemplateListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem('zureo_template_molds');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with empty molds list', () => {
    expect(component.molds.length).toBe(0);
  });

  it('should update molds when storage changes', () => {
    storage.create('Test', 'venta_contado');
    fixture.detectChanges();
    expect(component.molds.length).toBe(1);
    expect(component.molds[0].name).toBe('Test');
  });

  it('should open new form', () => {
    component.openNewForm();
    expect(component.showForm).toBeTrue();
    expect(component.editingMold).toBeNull();
  });

  it('should open edit form with mold', () => {
    const mold = storage.create('Edit Me', 'venta_contado');
    component.openEditForm(mold);
    expect(component.showForm).toBeTrue();
    expect(component.editingMold).toBe(mold);
  });

  it('should close form on cancel', () => {
    component.showForm = true;
    component.onFormCancelled();
    expect(component.showForm).toBeFalse();
  });

  it('should duplicate a mold', () => {
    const mold = storage.create('Original', 'remito');
    component.duplicateMold(mold);
    fixture.detectChanges();
    expect(component.molds.length).toBe(2);
  });

  it('should handle delete confirmation flow', () => {
    const mold = storage.create('To Delete', 'venta_contado');
    component.requestDelete(mold);
    expect(component.confirmDeleteId).toBe(mold.id);

    component.confirmDelete();
    fixture.detectChanges();
    expect(component.molds.length).toBe(0);
    expect(component.confirmDeleteId).toBeNull();
  });

  it('should cancel delete', () => {
    const mold = storage.create('Keep Me', 'venta_contado');
    component.requestDelete(mold);
    component.cancelDelete();
    expect(component.confirmDeleteId).toBeNull();
    expect(component.molds.length).toBe(1);
  });

  it('should format document type labels', () => {
    expect(component.getDocTypeLabel('venta_contado')).toBe('Venta Contado');
    expect(component.getDocTypeLabel('nota_credito')).toBe('Nota de Crédito');
  });

  it('should format dates', () => {
    const result = component.formatDate('2024-01-15T10:30:00Z');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('should update metadata in edit mode', () => {
    const mold = storage.create('Before Edit', 'venta_contado');
    component.editingMold = mold;
    component.onFormSaved({
      name: 'After Edit',
      documentType: 'remito',
      description: 'Updated desc'
    });
    fixture.detectChanges();
    expect(component.molds[0].name).toBe('After Edit');
    expect(component.molds[0].documentType).toBe('remito');
    expect(component.showForm).toBeFalse();
  });
});
