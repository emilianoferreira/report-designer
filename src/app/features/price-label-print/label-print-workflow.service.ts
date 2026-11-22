import { Injectable, OnDestroy } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { AuthService, Session } from '../../core/auth/auth.service';
import { PriceLabelArticle, PriceLabelCompany } from '../../core/models/price-label-template.model';
import { LabelPrintSessionService, expandLabelBatch } from './label-print-session.service';
import { LabelPrintApiService, PrintContext, PriceList, PrintSnapshot, ResolvedArticle } from './label-print-api.service';
import type { LabelPrintDraft } from './label-print-draft.service';
@Injectable()
export class LabelPrintWorkflowService extends LabelPrintSessionService implements OnDestroy {
  context?:PrintContext; lists:PriceList[]=[]; listCursor:string|null=null; listId=''; query='';
  results:ResolvedArticle[]=[]; searchCursor:string|null=null; searched=false;
  loading=false; searching=false; resolving=false; listing=false;
  error=''; searchError=''; resolveError=''; notice=''; snapshot?:PrintSnapshot;
  articles:PriceLabelArticle[]=[]; company:PriceLabelCompany={name:'',logo:'',currencySymbol:''};
  private initRequest=new Subscription(); private listRequest=new Subscription(); private searchRequest=new Subscription(); private resolveRequest=new Subscription();
  private authRequest:Subscription; private generation=0; private searchVersion=0; private alive=true;
  private searchedQuery = '';
  private readonly companyId:string|undefined; private readonly userId:string|undefined;
  constructor(private api:LabelPrintApiService, private auth:AuthService, private http:HttpClient){
    super(); this.companyId=auth.session?.company_id; this.userId=auth.session?.user.id;
    this.authRequest=auth.session$.subscribe(s=>{ if(!s || s.company_id!==this.companyId || s.user.id!==this.userId) this.clear(); });
  }
  initialize():void {
    this.initRequest.unsubscribe(); this.loading=true; this.error='';
    this.initRequest=this.api.contextInfo().subscribe({
      next: context => {
        if (!context.available) {
          this.clear();
          this.error = '';
        }
        this.context = context;
        this.loading = false;
        if (!context.available) return;
        this.loadLists();
        if (this.lines.length && !this.snapshot) {
          this.resolve();
          this.search();
        }
      },
      error: e => { this.loading = false; this.fail(e); }
    });
  }
  restoreDraft(draft: LabelPrintDraft): void {
    this.listId = draft.listId;
    this.query = draft.query;
    this.lines = draft.lines;
    this.lists = draft.selectedList ? [draft.selectedList] : [];
  }
  loadLists():void {
    if(this.listing)return; this.listing=true; this.error='';
    this.listRequest=this.api.lists(this.listCursor||'').subscribe({next:page=>{this.lists=[...this.lists,...page.items.filter(x=>!this.lists.some(l=>l.id===x.id))];this.listCursor=page.nextCursor;this.listing=false;},error:e=>{this.listing=false;this.fail(e);}});
  }
  selectList(id:string):void {
    if(id===this.listId)return; this.listId=id;this.snapshot=undefined;this.articles=[];this.notice='';
    this.resolve(); this.search();
  }
  search(more=false):void {
    if (more && !this.searchCursor) return;
    this.searchRequest.unsubscribe(); const revision=++this.searchVersion;
    const cursor=more?this.searchCursor:null;
    if(!more){this.results=[];this.searchCursor=null;this.searchedQuery=this.query.trim();} this.searchError='';this.searching=false;this.searched=false;
    if(!this.listId || !this.searchedQuery)return;
    this.searching=true;
    this.searchRequest=this.api.search(this.searchedQuery,this.listId,cursor||'').subscribe({next:page=>{
      if(revision!==this.searchVersion)return;
      this.results=more?[...this.results,...page.items.filter(x=>!this.results.some(r=>r.articleId===x.articleId))]:page.items;
      this.searchCursor=page.nextCursor;this.searching=false;this.searched=true;
    },error:e=>{this.searching=false;this.searchError='No se pudo buscar. Reintentá la búsqueda.';this.failAuth(e);}});
  }
  select(item:ResolvedArticle):void {
    if(item.status !== 'available' || !item.article || this.lines.some(l=>l.article.id===item.articleId))return;
    try { super.add({id:item.articleId,name:item.article.name,code:item.article.code,barcode:item.article.barcode||'',price:null});this.error='';this.snapshot=undefined;this.articles=[];this.resolve(); }
    catch(e){this.error=(e as Error).message;}
  }
  override quantity(id:string,value:number):void { try{super.quantity(id,value);this.error='';this.rebuild();}catch(e){this.error=(e as Error).message;} }
  override remove(id:string):void { super.remove(id);if(!this.lines.length || this.resolving || !this.snapshot)this.resolve();else this.rebuild(); }
  resolve():void {
    this.resolveRequest.unsubscribe();const generation=++this.generation;
    this.resolveError='';this.notice='';this.resolving=false;
    if(!this.listId || !this.lines.length){this.snapshot=undefined;this.articles=[];return;}
    const ids=this.lines.map(l=>l.article.id),list=this.listId, previous=this.snapshot;
    this.resolving=true;this.articles=[];
    this.resolveRequest=this.api.resolve(list,ids).subscribe({next:snapshot=>{
      if(generation!==this.generation)return;
      if(snapshot.priceListId!==list || snapshot.items.length!==ids.length || new Set(snapshot.items.map(i=>i.articleId)).size!==ids.length || ids.some(id=>!snapshot.items.some(i=>i.articleId===id))){this.resolving=false;this.resolveError='Respuesta de precios incompleta. Reintentá.';this.rebuild();return;}
      const changed=previous?snapshot.items.filter(i=>JSON.stringify(i.price)!==JSON.stringify(previous.items.find(p=>p.articleId===i.articleId)?.price)).length:0;
      this.snapshot=snapshot;this.resolving=false;this.notice=previous?changed+' precios modificados. Revisá la vista previa.':'';this.rebuild();
    },error:e=>{this.resolving=false;this.resolveError='No se pudieron actualizar los precios.';this.failAuth(e);this.rebuild();}});
  }
  row(id:string):ResolvedArticle|undefined {return this.snapshot?.items.find(i=>i.articleId===id);}
  private rebuild():void {
    this.articles=[];
    if(!this.snapshot || this.snapshot.priceListId!==this.listId || !this.lines.length || this.resolving)return;
    if(this.lines.some(l=>!this.row(l.article.id) || this.row(l.article.id)?.status!=='available'))return;
    const lines=this.lines.map(l=>{const r=this.row(l.article.id)!;const a=r.article!;return {quantity:l.quantity,article:{id:a.id,name:a.name,code:a.code,barcode:a.barcode||'',image:a.image,price:r.price.status==='available'?r.price.amount:null,currencyCode:r.price.currencyCode,currencySymbol:r.price.currencySymbol||r.price.currencyCode||''}};});
    this.company={name:this.snapshot.company.name,logo:this.snapshot.company.logo||'',currencySymbol:''};
    this.articles=expandLabelBatch(lines);
  }
  readonly authorizeOutput=async():Promise<boolean>=>{
    const generation=this.generation;
    try {const s=await firstValueFrom(this.http.get<Session>('/api/auth/session'));
      if(s.company_id!==this.companyId || s.user.id!==this.userId){this.clear();return false;}
      return this.alive && generation===this.generation && !this.resolving && this.articles.length>0;
    }catch(e){this.failAuth(e);this.error='No se pudo verificar la sesión. No se imprimió ni exportó.';return false;}
  };
  private fail(e:{status?:number}):void {this.error='No se pudo cargar el catálogo. Reintentá.';this.failAuth(e);}
  private failAuth(e:unknown):void {const status=(e as {status?:number})?.status;if(status===401 || status===403)this.clear();}
  private clear():void {
    this.generation++;this.searchVersion++;this.initRequest.unsubscribe();this.listRequest.unsubscribe();this.searchRequest.unsubscribe();this.resolveRequest.unsubscribe();
    this.lines=[];this.snapshot=undefined;this.articles=[];this.results=[];this.lists=[];this.context=undefined;this.listId='';this.listCursor=null;this.searchCursor=null;
    this.searchedQuery='';
    this.loading=this.listing=this.searching=this.resolving=false;this.error='La sesión cambió o no tenés acceso. Volvé a iniciar sesión.';
  }
  ngOnDestroy():void {this.alive=false;this.clear();this.authRequest.unsubscribe();}
}
