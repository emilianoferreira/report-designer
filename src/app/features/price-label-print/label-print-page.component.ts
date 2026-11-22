import { LabelDiagnostic } from '../price-label-designer/utils/label-diagnostics';
import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LabelTemplate } from '../../core/models/price-label-template.model';
import { AuthService } from '../../core/auth/auth.service';
import { PriceLabelStorageService } from '../price-label-designer/services/price-label-storage.service';
import { PriceLabelPreviewComponent } from '../price-label-designer/components/price-label-preview/price-label-preview.component';
import { templateErrors } from '../price-label-designer/utils/label-validation';
import { LabelPrintWorkflowService } from './label-print-workflow.service';
@Component({
 standalone:true,imports:[CommonModule,FormsModule,RouterLink,PriceLabelPreviewComponent],providers:[LabelPrintWorkflowService],
 templateUrl:'./label-print-page.component.html',
 styles:[`:host{display:block;padding:24px;overflow:auto;height:100%;box-sizing:border-box}header{display:flex;align-items:center;gap:24px}h1{flex:1}.demo{padding:12px;background:#fff3cd}section{margin:20px 0}button,select,input{padding:8px;margin:4px}input[type=number]{width:60px}table{width:100%;text-align:left;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ddd}.preview{height:800px}[role=alert]{color:#a11}.scroll{overflow:auto}`]
})
export class LabelPrintPageComponent implements OnInit {
 template?:LabelTemplate; templateError='';
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
 constructor(public storage:PriceLabelStorageService,public state:LabelPrintWorkflowService,private auth:AuthService){}
 ngOnInit():void{this.state.initialize();}
 get pages():number{return this.template?Math.ceil(this.state.total/(this.template.label.columns*this.template.label.rows)):0;}
 selected(id:string):boolean{return this.state.lines.some(l=>l.article.id===id);}
 selectTemplate(id:string):void {this.renderIssues=[];const saved=this.storage.getById(id);this.templateError=saved?templateErrors(saved).join(' '):'';this.template=saved&&!this.templateError?structuredClone(saved):undefined;}
 editQuantity(id:string,event:Event):void {const input=event.target as HTMLInputElement;this.state.quantity(id,input.value===''?NaN:Number(input.value));input.value=String(this.state.lines.find(l=>l.article.id===id)!.quantity);}
 hasUnsavedChanges():boolean{return !this.auth.leavingSession&&this.state.lines.length>0;}
 @HostListener('window:beforeunload',['$event']) beforeUnload(event:BeforeUnloadEvent):void{if(this.hasUnsavedChanges()){event.preventDefault();event.returnValue='';}}
}
