import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';
import { TemplateListComponent } from './template-list.component';
import { TemplateStorageService } from '../../services/template-storage.service';
import { createDefaultTemplate } from '../../data/default-template';

describe('TemplateListComponent', () => {
  let component:TemplateListComponent;let fixture:ComponentFixture<TemplateListComponent>;
  let storage:jasmine.SpyObj<TemplateStorageService>;let molds:BehaviorSubject<any[]>;
  const mold={id:'owned',name:'Reporte',documentType:'venta_contado' as const,description:'',companyId:'a',
    createdAt:'2024-01-15T10:30:00Z',updatedAt:'2024-01-15T10:30:00Z',template:createDefaultTemplate()};
  beforeEach(async () => {
    molds=new BehaviorSubject<any[]>([]);
    storage=jasmine.createSpyObj('Storage',['create','updateMetadata','duplicate','delete'],{molds$:molds.asObservable()});
    await TestBed.configureTestingModule({imports:[TemplateListComponent,RouterTestingModule],providers:[{provide:TemplateStorageService,useValue:storage}]}).compileComponents();
    fixture=TestBed.createComponent(TemplateListComponent);component=fixture.componentInstance;fixture.detectChanges();
  });
  it('starts empty and displays only documents emitted by the authenticated store',()=>{
    expect(component.molds).toEqual([]);molds.next([mold]);fixture.detectChanges();expect(component.molds).toEqual([mold]);
  });
  it('opens and cancels the creation form',()=>{component.openNewForm();expect(component.showForm).toBeTrue();expect(component.editingMold).toBeNull();component.onFormCancelled();expect(component.showForm).toBeFalse();});
  it('opens metadata editing',()=>{component.openEditForm(mold);expect(component.editingMold).toBe(mold);expect(component.showForm).toBeTrue();});
  it('closes the creation form only after a successful API save',async()=>{
    component.openNewForm();storage.create.and.resolveTo(mold);
    await component.onFormSaved({name:'Reporte',documentType:'venta_contado',description:''});
    expect(storage.create).toHaveBeenCalledWith('Reporte','venta_contado','');expect(component.showForm).toBeFalse();
  });
  it('keeps the form open when an unauthorized save fails',async()=>{
    component.openNewForm();storage.create.and.rejectWith({status:401});
    await expectAsync(component.onFormSaved({name:'Reporte',documentType:'venta_contado',description:''})).toBeRejected();
    expect(component.showForm).toBeTrue();
  });
  it('keeps delete confirmation when the API rejects deletion',async()=>{
    component.requestDelete(mold);storage.delete.and.rejectWith({status:403});
    await expectAsync(component.confirmDelete()).toBeRejected();expect(component.confirmDeleteId).toBe(mold.id);
    component.cancelDelete();expect(component.confirmDeleteId).toBeNull();
  });
  it('duplicates through the authenticated store',async()=>{storage.duplicate.and.resolveTo(mold);await component.duplicateMold(mold);expect(storage.duplicate).toHaveBeenCalledWith(mold.id);});
  it('formats document type labels and dates',()=>{expect(component.getDocTypeLabel('venta_contado')).toBe('Venta Contado');expect(component.formatDate(mold.createdAt)).toBeTruthy();});
});
