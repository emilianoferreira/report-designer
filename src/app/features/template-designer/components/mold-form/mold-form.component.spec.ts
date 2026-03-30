/**
 * MoldFormComponent Tests
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MoldFormComponent } from './mold-form.component';
import { TemplateMold } from '../../../../core/models/template.model';
import { createDefaultTemplate } from '../../data/default-template';

describe('MoldFormComponent', () => {
  let component: MoldFormComponent;
  let fixture: ComponentFixture<MoldFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MoldFormComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(MoldFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default to create mode', () => {
    expect(component.isEdit).toBeFalse();
    expect(component.title).toBe('Nuevo molde de impresión');
  });

  it('should be invalid when name is empty', () => {
    component.name = '';
    expect(component.isValid).toBeFalse();
    component.name = '   ';
    expect(component.isValid).toBeFalse();
  });

  it('should be valid when name has content', () => {
    component.name = 'My Template';
    expect(component.isValid).toBeTrue();
  });

  it('should emit saved data on submit', () => {
    let emitted: any;
    component.saved.subscribe(data => emitted = data);

    component.name = 'Test Name';
    component.documentType = 'remito';
    component.description = 'Test Desc';
    component.onSubmit();

    expect(emitted).toEqual({
      name: 'Test Name',
      documentType: 'remito',
      description: 'Test Desc'
    });
  });

  it('should not emit when invalid', () => {
    let emitted = false;
    component.saved.subscribe(() => emitted = true);

    component.name = '';
    component.onSubmit();

    expect(emitted).toBeFalse();
  });

  it('should emit cancelled event', () => {
    let cancelled = false;
    component.cancelled.subscribe(() => cancelled = true);
    component.onCancel();
    expect(cancelled).toBeTrue();
  });

  it('should trim name and description', () => {
    let emitted: any;
    component.saved.subscribe(data => emitted = data);

    component.name = '  Trimmed  ';
    component.description = '  Also trimmed  ';
    component.onSubmit();

    expect(emitted.name).toBe('Trimmed');
    expect(emitted.description).toBe('Also trimmed');
  });

  it('should load mold data in edit mode', () => {
    const mold: TemplateMold = {
      id: 'test-id',
      name: 'Existing',
      documentType: 'nota_credito',
      description: 'Existing desc',
      companyId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      template: createDefaultTemplate()
    };

    component.mold = mold;
    component.ngOnInit();

    expect(component.isEdit).toBeTrue();
    expect(component.title).toBe('Editar molde');
    expect(component.name).toBe('Existing');
    expect(component.documentType).toBe('nota_credito');
    expect(component.description).toBe('Existing desc');
  });

  it('should have document type options', () => {
    expect(component.documentTypes.length).toBeGreaterThan(0);
    expect(component.documentTypes.some(dt => dt.value === 'venta_contado')).toBeTrue();
  });
});
