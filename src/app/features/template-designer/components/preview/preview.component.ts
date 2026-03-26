/**
 * Preview Component
 * Renders the template + sample data as HTML in an iframe.
 * Shows the final result as it would look when printed/PDF'd.
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
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject, takeUntil, debounceTime } from 'rxjs';
import { TemplateStateService } from '../../services/template-state.service';
import { HtmlRendererService } from '../../services/html-renderer.service';
import { SAMPLE_INVOICE_DATA, SAMPLE_INVOICE_MULTILINE } from '../../data/sample-invoice';
import { InvoiceData } from '../../../../core/models/template.model';

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

  previewHtml = '';
  rawHtml = '';
  showRawHtml = false;
  sampleDataMode: 'single' | 'multi' = 'single';
  zoom = 0.75; // Preview starts at 75% zoom to fit

  private destroy$ = new Subject<void>();

  constructor(
    private templateState: TemplateStateService,
    private renderer: HtmlRendererService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Re-render preview when template changes (debounced)
    this.templateState.template$
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300)
      )
      .subscribe(template => {
        this.renderPreview();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Render the preview HTML and inject into iframe
   */
  renderPreview(): void {
    const template = this.templateState.getCurrentTemplate();
    const data = this.getActiveData();

    this.previewHtml = this.renderer.renderPreview(template, data);
    this.rawHtml = this.previewHtml;

    // Write to iframe
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

    this.cdr.markForCheck();
  }

  /**
   * Get the active sample data based on mode
   */
  private getActiveData(): InvoiceData {
    return this.sampleDataMode === 'single'
      ? SAMPLE_INVOICE_DATA
      : SAMPLE_INVOICE_MULTILINE;
  }

  /**
   * Toggle between single and multi-line sample data
   */
  toggleSampleData(): void {
    this.sampleDataMode = this.sampleDataMode === 'single' ? 'multi' : 'single';
    this.renderPreview();
  }

  /**
   * Toggle raw HTML view
   */
  toggleRawHtml(): void {
    this.showRawHtml = !this.showRawHtml;
  }

  /**
   * Print the preview
   */
  printPreview(): void {
    if (this.previewFrame?.nativeElement) {
      this.previewFrame.nativeElement.contentWindow?.print();
    }
  }

  /**
   * Export HTML template (with z-code directives, no data resolved)
   */
  exportHtmlTemplate(): void {
    const template = this.templateState.getCurrentTemplate();
    const html = this.renderer.exportAsZureoTemplate(template);

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.metadata.name || 'template'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Export preview HTML (with data resolved)
   */
  exportRenderedHtml(): void {
    const blob = new Blob([this.previewHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `preview.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Zoom controls
   */
  zoomIn(): void {
    this.zoom = Math.min(this.zoom + 0.1, 1.5);
  }

  zoomOut(): void {
    this.zoom = Math.max(this.zoom - 0.1, 0.3);
  }
}
