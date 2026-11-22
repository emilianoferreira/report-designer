import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthService, Session } from '../../core/auth/auth.service';
import { LabelPrintWorkflowService } from './label-print-workflow.service';
import { ResolvedArticle } from './label-print-api.service';
import { PriceLabelRendererService } from '../price-label-designer/services/price-label-renderer.service';

describe('Label print API workflow',()=>{
 let state:LabelPrintWorkflowService,http:HttpTestingController,auth:AuthService;
 const row:ResolvedArticle={articleId:'a',status:'available',article:{id:'a',code:'A',name:'Article',barcode:'123',image:null},price:{status:'available',amount:'0.00',currencyCode:'UYU',currencySymbol:'$',taxTreatment:'unknown'}};
 const snapshot=(list:string)=>({mode:'demo',priceListId:list,resolvedAt:'2026-11-17T12:00:00Z',sourceRevision:null,company:{name:'Demo',logo:null},items:[row]});
 beforeEach(()=>{
 TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),LabelPrintWorkflowService]});
 auth=TestBed.inject(AuthService);auth.session$.next({user:{id:'u'},company_id:'company'} as Session);
 state=TestBed.inject(LabelPrintWorkflowService);http=TestBed.inject(HttpTestingController);state.selectList('one');
 });
 afterEach(()=>{state.ngOnDestroy();http.verify({ignoreCancelled:true});});
 it('retains quantities and ignores cancelled list responses',()=>{
 state.select(row);const first=http.expectOne('/api/label-print/resolve');state.quantity('a',5);
 state.selectList('two');expect(first.cancelled).toBeTrue();
 http.expectOne('/api/label-print/resolve').flush(snapshot('two'));
 expect(state.total).toBe(5);expect(state.articles.length).toBe(5);expect(state.articles[0].price).toBe('0.00');
 });
 it('retains a snapshot after failed manual refresh, but never after a list change',()=>{
 state.select(row);http.expectOne('/api/label-print/resolve').flush(snapshot('one'));
 state.resolve();http.expectOne('/api/label-print/resolve').flush({}, {status:503,statusText:'Unavailable'});
 expect(state.articles.length).toBe(1);expect(state.snapshot?.priceListId).toBe('one');
 state.selectList('two');http.expectOne('/api/label-print/resolve').flush({}, {status:503,statusText:'Unavailable'});
 expect(state.articles.length).toBe(0);expect(state.snapshot).toBeUndefined();expect(state.total).toBe(1);
 });
 it('does not apply an incomplete snapshot and clears data on session change',()=>{
 state.select(row);http.expectOne('/api/label-print/resolve').flush({...snapshot('one'),items:[]});
 expect(state.articles.length).toBe(0);expect(state.resolveError).toContain('incompleta');
 auth.session$.next(null);expect(state.total).toBe(0);expect(state.listId).toBe('');
 });
 it('cancels the pending snapshot when its last article is removed',()=>{
 state.select(row);const request=http.expectOne('/api/label-print/resolve');state.remove('a');
 expect(request.cancelled).toBeTrue();expect(state.resolving).toBeFalse();expect(state.articles).toEqual([]);
 });
 it('formats canonical prices without losing decimal precision',()=>{
 const renderer=new PriceLabelRendererService();
 expect(renderer.formatPrice('9007199254740993.125',2)).toBe('9.007.199.254.740.993,13');
 expect(renderer.formatPrice('0.00',2)).toBe('0,00');
 expect(renderer.formatPrice('99.999',2)).toBe('100,00');
 expect(renderer.formatPrice('1.499',0)).toBe('1');
 expect(renderer.formatPrice(null,2)).toBe('');
 });
});
