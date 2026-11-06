import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LabelTemplate,
  PriceLabelArticle,
  PriceLabelCompany
} from '../../../../core/models/price-label-template.model';
import { mmToPx } from '../../../template-designer/utils/coordinate-utils';
import { PriceLabelRendererService } from '../../services/price-label-renderer.service';

import { labelLayoutError } from '../../utils/label-layout';

type PreviewMode = 'sheet' | 'html' | 'json';

@Component({
  selector: 'app-price-label-preview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './price-label-preview.component.html',
  styleUrl: './price-label-preview.component.scss'
})
export class PriceLabelPreviewComponent implements OnChanges, AfterViewInit, OnDestroy {
  @ViewChild('previewFrame') previewFrame!: ElementRef<HTMLIFrameElement>;

  @Input({ required: true }) template!: LabelTemplate;
  @Input({ required: true }) articles!: PriceLabelArticle[];
  @Input({ required: true }) company!: PriceLabelCompany;

  errors: string[] = [];
  warnings: string[] = [];
  checking = false;
  private revision = 0;
  copies = 1;
  mode: PreviewMode = 'sheet';
  html = '';
  json = '';
  zoom = 0.72;

  constructor(private renderer: PriceLabelRendererService) {}

  ngOnDestroy(): void { this.revision++; }

  ngAfterViewInit(): void {
    this.render();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.render();
  }

  get pageWidthPx(): number {
    return mmToPx(this.template.page.width);
  }

  get pageHeightPx(): number {
    return mmToPx(this.template.page.height);
  }

  setMode(mode: PreviewMode): void {
    this.mode = mode;
    if (mode === 'sheet') {
      this.injectIframe();
    }
  }

  onCopiesChange(): void {

    this.render();
  }

  get layoutError(): string { return labelLayoutError(this.template); }

  print(): void {
    if (this.layoutError || this.checking || this.errors.length) return;
    this.mode = 'sheet';
    this.injectIframe(true);
  }

  exportHtml(): void {
    if (this.layoutError || this.checking || this.errors.length) return;
    this.download(this.html, this.safeFileName('html'), 'text/html');
  }

  exportJson(): void {
    this.download(this.json, this.safeFileName('json'), 'application/json');
  }

  private render(): void {
    if (!this.template || !this.articles || !this.company) return;
    this.warnings = [];
    this.errors = this.renderer.validate(this.template, this.articles, this.copies, this.company);
    this.checking = true;
    void this.checkImages(++this.revision);
    this.html = this.renderer.renderToHtml(this.template, this.articles, this.copies, this.company);
    this.json = JSON.stringify(this.template, null, 2);
    if (this.mode === 'sheet') {
      this.injectIframe();
    }
  }

  private async checkImages(revision: number): Promise<void> {
    const errors: string[] = [];
    if (!this.errors.length) await Promise.all(this.articles.flatMap(article => this.template.elements.map(async el => {
      if (el.type !== 'image') return;
      const src = el.sourceType === 'url' ? el.url : this.renderer.resolvePath(el.binding, { article, company: this.company });
      const ok = await new Promise<boolean>(resolve => {
        const img = new Image();
        const finish = (value: boolean) => { clearTimeout(timer); img.onload = img.onerror = null; resolve(value); };
        const timer = setTimeout(() => finish(false), 10000);
        img.onload = () => finish(img.naturalWidth > 0); img.onerror = () => finish(false); img.src = String(src || '');
      });
      if (!ok) errors.push(article.name+' · '+el.name+': no se pudo cargar la imagen.');
    })));
    if (revision !== this.revision) return;
    this.errors = [...this.errors, ...errors]; this.checking = false;
  }

  private injectIframe(print = false): void {
    const revision = this.revision;
    setTimeout(() => {
      if (revision !== this.revision) return;
      const doc = this.previewFrame?.nativeElement.contentDocument;
      if (!doc) return;
      doc.open();
      doc.write(this.html);
      doc.close();
      void doc.fonts.ready.then(() => {
        if (revision !== this.revision || !this.previewFrame?.nativeElement.isConnected) return;
        const warnings = new Set<string>();
        for (const element of Array.from(doc.querySelectorAll<HTMLElement>('.label-text, .label-price'))) {
          const range = doc.createRange(); range.selectNodeContents(element);
          const text = range.getBoundingClientRect(), box = element.getBoundingClientRect();
          if (text.width && (text.left < box.left - 0.5 || text.top < box.top - 0.5 || text.right > box.right + 0.5 || text.bottom > box.bottom + 0.5)) {
            warnings.add('Texto recortado: ' + element.textContent?.slice(0, 80));
          }
        }
        this.warnings = [...warnings];
      });
      if (print) {
        const frame = this.previewFrame.nativeElement;
        Promise.all(Array.from(doc.images).map(img => img.decode()))
          .then(() => { if (revision === this.revision && frame.isConnected && !this.errors.length && !this.checking) frame.contentWindow?.print(); }).catch(() => { this.errors = ['No se pudieron cargar las imágenes para imprimir.']; });
      }
    });
  }

  private safeFileName(ext: string): string {
    const name = this.template.name || 'price-label-template';
    return `${name.replace(/[^a-z0-9_-]+/gi, '_')}.${ext}`;
  }

  private download(content: string, filename: string, type: string): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
