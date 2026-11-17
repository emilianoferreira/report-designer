import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { HANDLES_REQUEST_ERRORS } from '../../core/auth/auth.interceptor';
export interface CatalogArticle { id:string; code:string; name:string; barcode:string|null; image:string|null; }
export interface ResolvedPrice { status:'available'|'missing'|'invalid'; amount:string|null; currencyCode:string|null; currencySymbol:string|null; taxTreatment:'included'|'excluded'|'exempt'|'unknown'; }
export interface ResolvedArticle { articleId:string; status:'available'|'unavailable'; article:CatalogArticle|null; price:ResolvedPrice; }
export interface PriceList { id:string; name:string; }
export interface Page<T> { items:T[]; nextCursor:string|null; }
export interface LabelCompany { name:string; logo:string|null; }
export interface PrintContext { mode:string; available:boolean; company:LabelCompany|null; }
export interface PrintSnapshot { mode:string; priceListId:string; resolvedAt:string; sourceRevision:string|null; company:LabelCompany; items:ResolvedArticle[]; }
@Injectable({providedIn:'root'})
export class LabelPrintApiService {
  private readonly base='/api/label-print';
  private readonly context=new HttpContext().set(HANDLES_REQUEST_ERRORS,true);
  constructor(private http:HttpClient) {}
  contextInfo(){ return this.http.get<PrintContext>(this.base+'/context',{context:this.context}); }
  lists(cursor=''){ return this.http.get<Page<PriceList>>(this.base+'/price-lists',{context:this.context,params:{...(cursor?{cursor}:{}),pageSize:25}}); }
  search(query:string,priceListId:string,cursor=''){ return this.http.get<Page<ResolvedArticle>>(this.base+'/articles',{context:this.context,params:{query,priceListId,...(cursor?{cursor}:{}),pageSize:25}}); }
  resolve(priceListId:string,articleIds:string[]){ return this.http.post<PrintSnapshot>(this.base+'/resolve',{priceListId,articleIds},{context:this.context}); }
}
