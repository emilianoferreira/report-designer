import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabelPrintProfileId, LabelTemplate, PriceLabelArticle, PriceLabelCompany } from '../../../../core/models/price-label-template.model';
import { mmToPx } from '../../../template-designer/utils/coordinate-utils';
import { PriceLabelRendererService } from '../../services/price-label-renderer.service';
import { LabelPrintLayout, defaultLabelPrintProfile, labelSheetName } from '../../utils/label-layout';
import { LabelDiagnostic, inspectLabelDocument, summarizeDiagnostics } from '../../utils/label-diagnostics';
import { isThermalCalibration } from '../../data/label-calibration';

type PreviewMode = 'sheet' | 'html' | 'json';
@Component({
  selector:'app-price-label-preview', standalone:true, imports:[CommonModule,FormsModule],
  templateUrl:'./price-label-preview.component.html', styleUrl:'./price-label-preview.component.scss'
})
export class PriceLabelPreviewComponent implements OnChanges, AfterViewInit, OnDestroy {
  @ViewChild('previewFrame') previewFrame!:ElementRef<HTMLIFrameElement>;
  @Input({required:true}) template!:LabelTemplate;
  @Input({required:true}) articles!:PriceLabelArticle[];
  @Input({required:true}) company!:PriceLabelCompany;
  @Input() batchMode=false;
  @Input() batchProfile: LabelPrintProfileId = 'sheet';
  @Input() beforeOutput?:()=>Promise<boolean>;
  @Input() allowElementNavigation = false;
  @Output() diagnosticsChanged=new EventEmitter<LabelDiagnostic[]>(true);
  @Output() elementRequested = new EventEmitter<string>();
  diagnostics:LabelDiagnostic[]=[];
  checking=false;
  busy=false;
  outputStatus = '';
  copies=1;
  mode:PreviewMode='sheet';
  profile: LabelPrintProfileId = 'sheet';
  pageCount = 0;
  private layout?: LabelPrintLayout;
  html=''; json=''; zoom=0.72; currentPage=1;
  private revision=0;
  private ready=false;
  private staticDiagnostics:LabelDiagnostic[]=[];
  constructor(private renderer:PriceLabelRendererService){}
  get errors():string[]{return this.diagnostics.filter(d=>d.severity==='error').map(d=>d.message);}
  get editorDiagnostics(): LabelDiagnostic[] {
    return [...new Map(this.diagnostics.map(issue => [JSON.stringify([issue.elementId, issue.severity, issue.message]), issue])).values()];
  }
  get sheetName(): string { return labelSheetName(this.template); }
  get pageWidthPx():number{return mmToPx(this.layout?.width ?? 0);}
  get pageHeightPx():number{return mmToPx(this.layout?.height ?? 0);}
  get blocked():boolean{return this.busy || this.checking || !this.html || this.errors.length>0;}
  ngAfterViewInit():void{this.ready=true;this.render();}
  ngOnChanges(changes: SimpleChanges): void {
    const previous = changes['template']?.previousValue as LabelTemplate | undefined;
    if (this.batchMode) this.profile = this.batchProfile;
    else if (this.template?.calibration) this.profile = isThermalCalibration(this.template.calibration) ? 'thermal' : 'sheet';
    else if (!this.template?.printProfiles?.thermal) this.profile = 'sheet';
    else if (changes['template'] && previous?.id !== this.template.id) {
      this.profile = defaultLabelPrintProfile(this.template);
    }
    this.render();
  }
  ngOnDestroy():void{this.revision++;this.ready=false;}
  setMode(mode:PreviewMode):void{this.mode=mode;}
  selectProfile(profile: LabelPrintProfileId): void {
    this.profile = profile;
    this.mode = 'sheet';
    this.render();
  }
  onCopiesChange():void{this.render();}
  goToPage(page:number):void{
    if(page<1 || page>this.pageCount)return;
    this.currentPage=page;this.mode='sheet';
    const frame=this.previewFrame?.nativeElement;
    const target=frame?.contentDocument?.querySelectorAll<HTMLElement>('.page')[page-1];
    if(target)frame.contentWindow?.scrollTo(0,target.offsetTop);
  }
  async print():Promise<void>{await this.output('print');}
  async exportHtml():Promise<void>{await this.output('html');}
  exportJson():void{this.download(this.json,this.safeFileName('json'),'application/json');}
  private publish(issues:LabelDiagnostic[]):void{
    this.diagnostics=summarizeDiagnostics(issues,this.articles,this.copies,this.layout?.capacity ?? 0);
    this.diagnosticsChanged.emit(this.diagnostics);
  }
  private render():void{
    const revision=++this.revision;
    if(!this.template || !this.articles || !this.company)return;
    this.currentPage=1;
    this.outputStatus = '';
    const prepared = this.batchMode && (this.copies !== 1 || this.articles.length > 100)
      ? { layout: undefined, pageCount: 0, html: '', diagnostics: [{ severity: 'error', code: 'batch-limit', message: 'El lote no puede superar 100 etiquetas.' }] as LabelDiagnostic[] }
      : this.renderer.prepare(this.template, this.articles, this.copies, this.company, this.profile);
    this.layout = prepared.layout;
    this.pageCount = prepared.pageCount;
    this.staticDiagnostics = prepared.diagnostics;
    this.publish(this.staticDiagnostics);
    this.html = prepared.html;
    this.json=JSON.stringify(this.template,null,2);
    this.checking=!!this.html;
    if(!this.ready)return;
    // One document per revision, shared by preview, inspection and print.
    const doc=this.previewFrame.nativeElement.contentDocument;
    if(!doc)return;
    doc.open();doc.write(this.html);doc.close();
    if(this.html)void this.inspect(revision,doc);
  }
  async revalidate():Promise<void>{
    const doc=this.previewFrame?.nativeElement.contentDocument;
    if(doc && this.html && !this.busy && !this.checking)await this.inspect(this.revision,doc);
  }
  private async inspect(revision:number,doc:Document):Promise<boolean>{
    this.checking=true;
    const issues=await inspectLabelDocument(doc,this.template,this.articles,this.copies);
    if(!this.ready || revision!==this.revision || this.previewFrame.nativeElement.contentDocument!==doc)return false;
    this.publish([...this.staticDiagnostics,...issues]);this.checking=false;
    return !this.errors.length;
  }
  private async output(kind:'print'|'html'):Promise<void>{
    if(this.blocked)return;
    const revision=this.revision;
    const doc=this.previewFrame.nativeElement.contentDocument;
    if(!doc)return;
    this.busy=true;
    this.outputStatus = '';
    try{
      if(this.beforeOutput && !await this.beforeOutput())return;
      if(!this.ready || revision!==this.revision)return;
      if(!await this.inspect(revision,doc))return;
      if(kind==='html') {
        this.download(this.html,this.safeFileName('html'),'text/html');
        this.outputStatus = 'Descarga HTML iniciada.';
      }
      else {
        this.mode='sheet';
        await new Promise<void>(resolve=>setTimeout(resolve,0));
        if(this.ready && revision===this.revision)this.previewFrame.nativeElement.contentWindow?.print();
      }
    }catch{
      if(this.ready && revision===this.revision)this.publish([...this.diagnostics,{severity:'error',code:'output',message:'No se pudo preparar la salida. Reintentá la validación.'}]);
    }finally{this.busy=false;}
  }
  private safeFileName(ext:string):string{return (this.template.name||'price-label-template').replace(/[^a-z0-9_-]+/gi,'_')+'.'+ext;}
  private download(content:string,filename:string,type:string):void{
    const url=URL.createObjectURL(new Blob([content],{type}));const anchor=document.createElement('a');
    anchor.href=url;anchor.download=filename;anchor.click();URL.revokeObjectURL(url);
  }
}
