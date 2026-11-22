import { ElementRef } from '@angular/core';
import { createDefaultPriceLabelTemplate } from '../price-label-designer/data/default-price-label-template';
import { SAMPLE_PRICE_LABEL_ARTICLES, SAMPLE_PRICE_LABEL_COMPANY } from '../price-label-designer/data/sample-price-label-data';
import { PriceLabelRendererService } from '../price-label-designer/services/price-label-renderer.service';
import { PriceLabelPreviewComponent } from '../price-label-designer/components/price-label-preview/price-label-preview.component';
import { summarizeDiagnostics, withLabelTimeout, inspectLabelDocument } from '../price-label-designer/utils/label-diagnostics';

describe('Validated label output',()=>{
 const renderer=new PriceLabelRendererService();
 const article={...SAMPLE_PRICE_LABEL_ARTICLES[0],code:'CODE1'};
 const company=SAMPLE_PRICE_LABEL_COMPANY;
 it('reports an invalid barcode once, with article, element, count and every affected page',()=>{
   const template=createDefaultPriceLabelTemplate();template.elements=template.elements.filter(e=>e.type==='barcode');
   const invalid={...article,barcode:''};
   const issues=summarizeDiagnostics(renderer.diagnose(template,[invalid,invalid,invalid],1,company),[invalid,invalid,invalid],1,2);
   expect(issues.length).toBe(1);expect(issues[0].articleId).toBe(article.id);
   expect(issues[0].elementId).toBe(template.elements[0].id);expect(issues[0].quantity).toBe(3);expect(issues[0].pages).toEqual([1,2]);
   expect(renderer.renderToHtml(template,[invalid],1,company)).toBe('');
 });
 it('retains distinct warnings for same-named articles and merges repeated page locations',()=>{
   const second={...article,id:'second'};
   const base={severity:'warning' as const,code:'clipped',message:'Texto recortado',elementId:'name'};
   const result=summarizeDiagnostics([{...base,articleId:article.id,pages:[1]},{...base,articleId:article.id,pages:[2]},{...base,articleId:second.id,pages:[2]}],[article,article,second],1,2);
   expect(result.length).toBe(2);expect(result[0].pages).toEqual([1,2]);expect(result[0].quantity).toBe(2);
 });
 it('does not expand invalid copy counts while reporting their errors',()=>{
   const template=createDefaultPriceLabelTemplate();
   const issues=summarizeDiagnostics(renderer.diagnose(template,[article],1000000000,company),[article],1000000000,32);
   expect(issues.some(i=>i.message.includes('99'))).toBeTrue();expect(issues[0].pages).toEqual([]);
 });
 it('bounds resource validation instead of waiting forever',async()=>{
   await expectAsync(withLabelTimeout(new Promise(()=>{}),5)).toBeRejected();
 });
 it('reports font failure and image decode failure with article attribution',async()=>{
   const template=createDefaultPriceLabelTemplate();template.elements=template.elements.filter(e=>e.type==='image');
   const doc=document.implementation.createHTMLDocument();doc.body.innerHTML=renderer.renderLabel(template,{article,company});
   Object.defineProperty(doc,'fonts',{value:{ready:Promise.reject(new Error('font'))}});
   spyOn(doc.images[0],'decode').and.returnValue(Promise.reject(new Error('image')));
   const issues=await inspectLabelDocument(doc,template,[article],1);
   expect(issues.some(i=>i.code==='fonts'&&i.severity==='error')).toBeTrue();
   expect(issues.find(i=>i.code==='image-load')?.articleId).toBe(article.id);
 });
 it('cancels an output authorization if the template revision changes',async()=>{
   const frame=document.createElement('iframe');document.body.appendChild(frame);
   const component=new PriceLabelPreviewComponent(renderer);
   component.previewFrame=new ElementRef(frame);component.template=createDefaultPriceLabelTemplate();
   component.template.elements=component.template.elements.filter(e=>e.type==='text');component.articles=[article];component.company=company;
   const printed=spyOn(frame.contentWindow!,'print');
   try {
     component.ngAfterViewInit();await new Promise(resolve=>setTimeout(resolve,20));
     expect(component.blocked).toBeFalse();
     let authorize!:(value:boolean)=>void;
     component.beforeOutput=()=>new Promise<boolean>(resolve=>authorize=resolve);
     const pending=component.print();component.ngOnChanges({});authorize(true);await pending;
     expect(printed).not.toHaveBeenCalled();
   }finally{component.ngOnDestroy();frame.remove();}
 });
});
