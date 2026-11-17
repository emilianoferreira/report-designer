import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LabelTemplate, PriceLabelArticle } from '../../core/models/price-label-template.model';
import { AuthService } from '../../core/auth/auth.service';
import { PriceLabelStorageService } from '../price-label-designer/services/price-label-storage.service';
import { PriceLabelPreviewComponent } from '../price-label-designer/components/price-label-preview/price-label-preview.component';
import { SAMPLE_PRICE_LABEL_ARTICLES, SAMPLE_PRICE_LABEL_COMPANY } from '../price-label-designer/data/sample-price-label-data';
import { templateErrors } from '../price-label-designer/utils/label-validation';
import { LabelPrintSessionService, expandLabelBatch } from './label-print-session.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PriceLabelPreviewComponent],
  providers: [LabelPrintSessionService],
  template: `
    <header><a routerLink="/templates">← Moldes</a><h1>Preparar impresión</h1><a routerLink="/price-labels">Diseñar etiquetas</a></header>
    <p class="demo" role="status"><strong>Demostración — datos sintéticos.</strong> Este lote no consulta Zureo y se descarta al salir.</p>
    @if (storage.error$ | async; as message) { <p role="alert">{{message}} <button (click)="storage.refresh()">Reintentar</button></p> }
    <label>Molde guardado <select [ngModel]="template?.id || ''" (ngModelChange)="selectTemplate($event)">
      <option value="">Seleccionar molde</option>
      @for (saved of storage.templates$ | async; track saved.id) { <option [value]="saved.id">{{saved.name}}</option> }
    </select></label>
    @if (error) { <p role="alert">{{error}}</p> }
    <section><h2>Artículos de demostración</h2>
      @for (article of samples; track article.id) { <button [disabled]="selected(article.id) || session.total >= 100" (click)="add(article)">{{article.name}} · {{selected(article.id) ? 'Agregado' : 'Agregar'}}</button> }
    </section>
    <section><h2>Lote · {{session.total}} / 100 etiquetas</h2>
      <table><thead><tr><th>Artículo</th><th>Código de barras</th><th>Precio demo ($)</th><th>Cantidad</th><th>Acciones</th></tr></thead><tbody>
        @for (line of session.lines; track line.article.id) {
          <tr><td>{{line.article.name}}</td><td>{{line.article.barcode}}</td><td>{{line.article.price | number:'1.2-2'}}</td><td>
            <button aria-label="Disminuir cantidad" [disabled]="line.quantity <= 1" (click)="quantity(line.article.id, line.quantity-1)">−</button>
            <input type="number" min="1" max="100" [attr.aria-label]="'Cantidad de ' + line.article.name" [value]="line.quantity" (change)="editQuantity(line.article.id, $event)" />
            <button aria-label="Aumentar cantidad" [disabled]="session.total >= 100" (click)="quantity(line.article.id, line.quantity+1)">+</button>
          </td><td><button (click)="remove(line.article.id)">Eliminar</button></td></tr>
        }
      </tbody></table>
      @if (!session.lines.length) { <p>Agregá artículos para preparar el lote.</p> }
    </section>
    @if (template && articles.length) {
      <p>{{pages}} páginas · {{session.total}} etiquetas · Datos de demostración</p>
      <div class="preview"><app-price-label-preview [template]="template" [articles]="articles" [company]="company" [batchMode]="true" /></div>
    }
  `,
  styles: [`:host{display:block;padding:24px;overflow:auto;height:100%;box-sizing:border-box}header{display:flex;align-items:center;gap:24px}h1{flex:1}.demo{padding:12px;background:#fff3cd}section{margin:20px 0}button,select,input{padding:8px;margin:4px}input{width:60px}table{width:100%;text-align:left;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ddd}.preview{height:800px}[role=alert]{color:#a11}`]
})
export class LabelPrintPageComponent {
  readonly samples = SAMPLE_PRICE_LABEL_ARTICLES;
  readonly company = SAMPLE_PRICE_LABEL_COMPANY;
  template?: LabelTemplate;
  articles: PriceLabelArticle[] = [];
  error = '';
  constructor(public storage: PriceLabelStorageService, public session: LabelPrintSessionService, private auth: AuthService) {}
  get pages(): number { return this.template ? Math.ceil(this.session.total / (this.template.label.columns * this.template.label.rows)) : 0; }
  selected(id: string): boolean { return this.session.lines.some(l => l.article.id === id); }
  selectTemplate(id: string): void {
    const saved = this.storage.getById(id);
    this.error = saved ? templateErrors(saved).join(' ') : '';
    this.template = saved && !this.error ? structuredClone(saved) : undefined;
  }
  add(article: PriceLabelArticle): void { this.change(() => this.session.add(article)); }
  quantity(id: string, value: number): void { this.change(() => this.session.quantity(id, value)); }
  editQuantity(id: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.quantity(id, input.value === '' ? NaN : Number(input.value));
    input.value = String(this.session.lines.find(l => l.article.id === id)!.quantity);
  }
  remove(id: string): void { this.change(() => this.session.remove(id)); }
  private change(action: () => void): void {
    try { action(); this.articles = this.session.lines.length ? expandLabelBatch(this.session.lines) : []; this.error = ''; }
    catch (error) { this.error = (error as Error).message; }
  }
  hasUnsavedChanges(): boolean { return !this.auth.leavingSession && this.session.lines.length > 0; }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; }
  }
}
