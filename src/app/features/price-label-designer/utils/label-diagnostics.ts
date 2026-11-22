import { LabelTemplate, PriceLabelArticle } from '../../../core/models/price-label-template.model';
import { labelPageNumber } from './label-layout';

export interface LabelDiagnostic {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  articleId?: string;
  articleName?: string;
  articleCode?: string;
  elementId?: string;
  elementName?: string;
  pages?: number[];
  quantity?: number;
}

/** Enrich and collapse repeated copies without discarding affected pages. */
export function summarizeDiagnostics(issues: LabelDiagnostic[], articles: PriceLabelArticle[], copies: number, capacity: number): LabelDiagnostic[] {
  const locations = new Map<string, {quantity:number; pages:Set<number>}>();
  if (Number.isInteger(copies) && copies > 0 && copies <= 99 && Number.isFinite(capacity) && capacity > 0) {
    articles.forEach((article,index) => {
      const location = locations.get(article.id) ?? {quantity:0,pages:new Set<number>()};
      location.quantity += copies;
      for(let copy=0;copy<copies;copy++) location.pages.add(labelPageNumber(index * copies + copy, capacity));
      locations.set(article.id, location);
    });
  }
  const grouped = new Map<string,LabelDiagnostic>();
  for(const issue of issues) {
    const key=JSON.stringify([issue.severity,issue.code,issue.articleId,issue.elementId,issue.message]);
    const location=issue.articleId ? locations.get(issue.articleId) : undefined;
    const previous=grouped.get(key);
    grouped.set(key,{...issue,quantity:location?.quantity,
      pages:[...new Set([...(previous?.pages??[]),...(issue.pages??location?.pages??[])])].sort((a,b)=>a-b)});
  }
  return [...grouped.values()];
}

export async function withLabelTimeout<T>(promise: Promise<T>, milliseconds=10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise,new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('Tiempo de validación agotado.')),milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

/** Inspect the same document that will be printed; do not rebuild another HTML. */
export async function inspectLabelDocument(doc: Document, template:LabelTemplate, articles:PriceLabelArticle[], copies:number):Promise<LabelDiagnostic[]> {
  const issues:LabelDiagnostic[]=[];
  const elements=[...template.elements].sort((a,b)=>a.zIndex-b.zIndex);
  const cells=Array.from(doc.querySelectorAll<HTMLElement>('.label-cell'));
  const pages=Array.from(doc.querySelectorAll<HTMLElement>('.page'));
  const identify=(element:HTMLElement):Partial<LabelDiagnostic>=>{
    const cell=element.closest('.label-cell') as HTMLElement;
    const index=cells.indexOf(cell);
    const article=articles[Math.floor(index/copies)];
    const object=elements[Array.from(cell?.children??[]).indexOf(element)];
    const page = pages.findIndex(candidate => candidate === cell?.closest('.page'));
    return {articleId:article?.id,articleName:article?.name,articleCode:article?.['code'],elementId:object?.id,elementName:object?.name,pages:page < 0 ? undefined : [page + 1]};
  };
  // Trigger layout before awaiting the document's font set.
  void doc.body.offsetHeight;
  const fonts=withLabelTimeout(doc.fonts.ready).catch(()=>{issues.push({severity:'error',code:'fonts',message:'No se pudieron preparar las fuentes para imprimir.'});});
  const images=Array.from(doc.images).map(async image=>{
    try { await withLabelTimeout(image.decode()); if(!image.naturalWidth)throw new Error('Imagen vacía'); }
    catch {const owner=image.closest('.label-element') as HTMLElement;
      issues.push({...identify(owner),severity:'error',code:'image-load',message:'No se pudo cargar la imagen.'});}
  });
  await Promise.all([fonts,...images]);
  for(const element of Array.from(doc.querySelectorAll<HTMLElement>('.label-text, .label-price'))) {
    const range=doc.createRange();range.selectNodeContents(element);
    const text=range.getBoundingClientRect(),box=element.getBoundingClientRect();
    if(text.width && (text.left<box.left-0.5 || text.top<box.top-0.5 || text.right>box.right+0.5 || text.bottom>box.bottom+0.5))
      issues.push({...identify(element),severity:'warning',code:'clipped-text',message:'Texto recortado: '+element.textContent?.slice(0,80)});
  }
  return issues;
}
