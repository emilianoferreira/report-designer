/**
 * Preview Component
 * Renders the template + sample data as HTML in an iframe.
 * Shows the final result as it would look when printed/PDF'd.
 *
 * Also acts as the central export hub: HTML (rendered + z-code) / JSON,
 * with both download and copy-to-clipboard actions for each format.
 */
import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil, debounceTime } from 'rxjs';
import { TemplateStateService } from '../../services/template-state.service';
import { HtmlRendererService } from '../../services/html-renderer.service';
import { SAMPLE_INVOICE_DATA, SAMPLE_INVOICE_MULTILINE } from '../../data/sample-invoice';
import { InvoiceData } from '../../../../core/models/template.model';
import { mmToPx } from '../../utils/coordinate-utils';

export type PreviewViewMode = 'render' | 'html' | 'json';

@Component({
  selector: 'app-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './preview.component.html',
  styleUrl: './preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PreviewComponent implements OnInit, OnDestroy {
  @ViewChild('previewFrame') previewFrame!: ElementRef<HTMLIFrameElement>;

  // ─── Render outputs (recomputed on each renderPreview) ───
  previewHtml = '';      // HTML with data resolved
  templateHtml = '';     // HTML with z-code directives (no data)
  templateJson = '';     // JSON of the template definition

  // ─── View state ───
  viewMode: PreviewViewMode = 'render';
  sampleDataMode: 'single' | 'multi' = 'single';
  zoom = 0.75; // Preview starts at 75% zoom to fit
  pageWidthPx = mmToPx(210);  // Updated from template on each render
  pageHeightPx = mmToPx(297);

  // ─── Copy feedback ───
  copyStatus: 'idle' | 'success' | 'error' = 'idle';
  copyStatusMessage = '';
  private copyStatusTimeout: any = null;

  private destroy$ = new Subject<void>();

  constructor(
    private templateState: TemplateStateService,
    private renderer: HtmlRendererService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Re-render preview when template changes (debounced)
    this.templateState.template$
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300)
      )
      .subscribe(() => {
        this.renderPreview();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.copyStatusTimeout) clearTimeout(this.copyStatusTimeout);
  }

  // ─────────────────────────────────────────────────────────────────
  // Rendering
  // ─────────────────────────────────────────────────────────────────

  /**
   * Recompute all 4 output formats and (if in render mode) inject HTML
   * into the iframe. Called on init, on template change, and when the
   * sample data toggle flips.
   */
  renderPreview(): void {
    const template = this.templateState.getCurrentTemplate();
    const data = this.getActiveData();

    this.pageWidthPx = mmToPx(template.page.width);
    this.pageHeightPx = mmToPx(template.page.height);

    // Precompute all formats — cheap and keeps view switching instant
    this.previewHtml = this.renderer.renderPreview(template, data);
    this.templateHtml = this.renderer.exportAsZureoTemplate(template);
    this.templateJson = JSON.stringify(template, null, 2);

    // Inject into iframe only if currently in render view
    if (this.viewMode === 'render') {
      this.injectIframe();
    }

    this.cdr.markForCheck();
  }

  private injectIframe(): void {
    setTimeout(() => {
      if (this.previewFrame?.nativeElement) {
        const doc = this.previewFrame.nativeElement.contentDocument;
        if (doc) {
          doc.open();
          doc.write(this.previewHtml);
          doc.close();
        }
      }
    }, 50);
  }

  /**
   * Switch the preview body between Render / HTML / JSON views.
   * When returning to Render, re-inject the iframe (it was destroyed by *ngIf).
   */
  setViewMode(mode: PreviewViewMode): void {
    this.viewMode = mode;
    if (mode === 'render') {
      this.injectIframe();
    }
    this.cdr.markForCheck();
  }

  // ─────────────────────────────────────────────────────────────────
  // Sample data toggle
  // ─────────────────────────────────────────────────────────────────

  private getActiveData(): InvoiceData {
    return this.sampleDataMode === 'single'
      ? SAMPLE_INVOICE_DATA
      : SAMPLE_INVOICE_MULTILINE;
  }

  toggleSampleData(): void {
    this.sampleDataMode = this.sampleDataMode === 'single' ? 'multi' : 'single';
    this.renderPreview();
  }

  // ─────────────────────────────────────────────────────────────────
  // Print
  // ─────────────────────────────────────────────────────────────────

  printPreview(): void {
    if (this.previewFrame?.nativeElement) {
      this.previewFrame.nativeElement.contentWindow?.print();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Export — download as file
  // ─────────────────────────────────────────────────────────────────

  exportHtmlRendered(): void {
    this.downloadBlob(this.previewHtml, this.fileName('html'), 'text/html');
  }

  exportHtmlTemplate(): void {
    this.downloadBlob(this.templateHtml, this.fileName('template.html'), 'text/html');
  }

  exportJson(): void {
    this.downloadBlob(this.templateJson, this.fileName('json'), 'application/json');
  }

  private fileName(ext: string): string {
    const name = this.templateState.getCurrentTemplate().metadata.name || 'template';
    const safe = name.replace(/[^a-z0-9_\-]+/gi, '_');
    return `${safe}.${ext}`;
  }

  private downloadBlob(content: string, filename: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─────────────────────────────────────────────────────────────────
  // Copy — to clipboard
  // ─────────────────────────────────────────────────────────────────

  copyHtmlRendered(): Promise<void> {
    return this.copyToClipboard(this.previewHtml);
  }

  copyHtmlTemplate(): Promise<void> {
    return this.copyToClipboard(this.templateHtml);
  }

  copyJson(): Promise<void> {
    return this.copyToClipboard(this.templateJson);
  }

  private async copyToClipboard(text: string): Promise<void> {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API not available');
      await navigator.clipboard.writeText(text);
      this.setCopyStatus('success', 'Copiado ✓');
    } catch (err) {
      console.warn('[Preview] copyToClipboard failed', err);
      this.setCopyStatus('error', 'Error al copiar');
    }
  }

  private setCopyStatus(status: 'success' | 'error', message: string): void {
    if (this.copyStatusTimeout) clearTimeout(this.copyStatusTimeout);
    this.copyStatus = status;
    this.copyStatusMessage = message;
    this.cdr.markForCheck();
    this.copyStatusTimeout = setTimeout(() => {
      this.copyStatus = 'idle';
      this.copyStatusMessage = '';
      this.cdr.markForCheck();
    }, 2000);
  }

  // ─────────────────────────────────────────────────────────────────
  // Zoom
  // ─────────────────────────────────────────────────────────────────

  zoomIn(): void {
    this.zoom = Math.min(this.zoom + 0.1, 1.5);
  }

  zoomOut(): void {
    this.zoom = Math.max(this.zoom - 0.1, 0.3);
  }
}
