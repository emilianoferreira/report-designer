import { LabelDiagnostic } from '../price-label-designer/utils/label-diagnostics';
import { AfterViewInit, Component, ElementRef, HostListener, Injector, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { LabelPrintProfileId, LabelTemplate } from '../../core/models/price-label-template.model';
import { AuthService } from '../../core/auth/auth.service';
import { PriceLabelStorageService } from '../price-label-designer/services/price-label-storage.service';
import { PriceLabelPreviewComponent } from '../price-label-designer/components/price-label-preview/price-label-preview.component';
import { templateErrors } from '../price-label-designer/utils/label-validation';
import { defaultLabelPrintProfile, labelSheetName } from '../price-label-designer/utils/label-layout';
import { LabelPrintWorkflowService } from './label-print-workflow.service';
@Component({
 standalone:true,imports:[CommonModule,FormsModule,RouterLink,PriceLabelPreviewComponent],providers:[LabelPrintWorkflowService],
 templateUrl:'./label-print-page.component.html',
 styleUrl:'./label-print-page.component.scss'
})
export class LabelPrintPageComponent implements OnInit, AfterViewInit, OnDestroy {
 @ViewChild('pageTitle') private pageTitle!: ElementRef<HTMLHeadingElement>;
 @ViewChild('batchTitle') private batchTitle!: ElementRef<HTMLHeadingElement>;
 @ViewChild('reviewTitle') private reviewTitle?: ElementRef<HTMLHeadingElement>;
 @ViewChild('searchField') private searchField?: ElementRef<HTMLInputElement>;
 @ViewChildren('removeButton') private removeButtons!: QueryList<ElementRef<HTMLButtonElement>>;
 template?:LabelTemplate; templateError='';
 profile: LabelPrintProfileId = 'sheet';
 readonly sheetName = labelSheetName;
 loadingTemplate = true;
 templateLoadFailed = false;
 private requestedTemplateId = '';
 private templateRequest = 0;
 private routeSubscription?: Subscription;
 renderIssues:LabelDiagnostic[]=[];
 rowDiagnostics(id:string):string[] {
   const row=this.state.row(id);
   if(!row)return ['Pendiente de consulta.'];
   if(row.status==='unavailable')return ['Artículo no disponible: retiralo del lote para imprimir.'];
   const messages=this.state.articles.length?this.renderIssues.filter(i=>i.articleId===id).map(i=>(i.severity==='error'?'Error: ':'Advertencia: ')+(i.elementName?i.elementName+' · ':'')+i.message):[];
   if(row.price.status!=='available')messages.push('Sin precio válido: solo se admite un molde que no use ese dato.');
   if(row.price.taxTreatment==='unknown')messages.push('Tratamiento tributario no informado; no se presume IVA incluido.');
   return messages;
 }
 constructor(public storage:PriceLabelStorageService,public state:LabelPrintWorkflowService,private auth:AuthService,private route:ActivatedRoute,private injector:Injector){}
 ngOnInit(): void {
   this.state.initialize();
   this.routeSubscription = this.route.queryParamMap.subscribe(params => {
     this.requestedTemplateId = params.get('templateId') ?? '';
     void this.loadRequestedTemplate(this.storage.ready);
   });
 }
 ngAfterViewInit(): void { this.pageTitle.nativeElement.focus(); }

 goToBatch(): void { this.focusSection(this.batchTitle.nativeElement); }
 goToReview(): void {
   if (this.reviewTitle) this.focusSection(this.reviewTitle.nativeElement);
 }

 private focusSection(heading: HTMLHeadingElement): void {
   heading.focus({ preventScroll: true });
   heading.scrollIntoView({ block: 'start' });
 }

 removeLine(id: string): void {
   const index = this.state.lines.findIndex(line => line.article.id === id);
   if (index < 0) return;
   this.state.remove(id);
   afterNextRender(() => {
     const next = this.removeButtons.get(Math.min(index, this.removeButtons.length - 1));
     (next?.nativeElement ?? this.searchField?.nativeElement ?? this.batchTitle.nativeElement).focus();
   }, { injector: this.injector });
 }
 ngOnDestroy(): void {
   this.templateRequest++;
   this.routeSubscription?.unsubscribe();
 }
 retryTemplates(): void { void this.loadRequestedTemplate(this.storage.refresh()); }
 private async loadRequestedTemplate(ready: Promise<void>): Promise<void> {
   const request = ++this.templateRequest;
   const id = this.requestedTemplateId;
   this.loadingTemplate = true;
   this.templateLoadFailed = false;
   this.template = undefined;
   this.templateError = '';
   await ready;
   if (request !== this.templateRequest) return;
   try {
     if (id) {
       const saved = await this.storage.fetch(id);
       if (request === this.templateRequest) this.applyTemplate(saved);
     }
   } catch (error) {
     if (request !== this.templateRequest) return;
     this.templateLoadFailed = (error as { status?: number })?.status !== 404;
     this.templateError = this.templateLoadFailed ? 'No se pudo cargar la revisión del molde.' : 'No se encontró el molde de etiqueta.';
   } finally {
     if (request === this.templateRequest) this.loadingTemplate = false;
   }
 }
 selected(id:string):boolean{return this.state.lines.some(l=>l.article.id===id);}
 selectTemplate(id: string): void {
   this.requestedTemplateId = id;
   this.templateLoadFailed = false;
   this.applyTemplate(this.storage.getById(id));
 }
 private applyTemplate(saved: LabelTemplate | undefined): void {
   this.renderIssues = [];
   this.templateError = saved?.calibration ? 'Abrí el molde de calibración desde Mis moldes para imprimir su patrón.'
     : saved ? templateErrors(saved).join(' ') : this.requestedTemplateId ? 'No se encontró el molde de etiqueta.' : '';
   this.template = saved && !this.templateError ? structuredClone(saved) : undefined;
   this.profile = this.template ? defaultLabelPrintProfile(this.template) : 'sheet';
 }
 editQuantity(id: string, event: Event): void {
   const line = this.state.lines.find(item => item.article.id === id);
   if (!line) return;
   const input = event.target as HTMLInputElement;
   this.state.quantity(id, input.valueAsNumber);
   input.value = String(this.state.lines.find(item => item.article.id === id)?.quantity ?? line.quantity);
 }
 hasUnsavedChanges():boolean{return !this.auth.leavingSession&&this.state.lines.length>0;}
 @HostListener('window:beforeunload',['$event']) beforeUnload(event:BeforeUnloadEvent):void{if(this.hasUnsavedChanges()){event.preventDefault();event.returnValue='';}}
}
