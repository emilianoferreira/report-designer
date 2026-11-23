import { measureRenderSurface } from '../../utils/measure-render-surface';
import { inject } from '@angular/core';
import { REPORT_SCENARIOS, ScenarioMode, ValidationSessionService } from '../../services/validation-session.service';
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
  EventEmitter,
  Output,
  Input,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, skip, tap } from 'rxjs';
import { TemplateStateService } from '../../services/template-state.service';
import { HtmlRendererService } from '../../services/html-renderer.service';
import { SAMPLE_INVOICE_DATA, SAMPLE_INVOICE_FIFTEEN, SAMPLE_INVOICE_MULTILINE } from '../../data/sample-invoice';
import { InvoiceData } from '../../../../core/models/template.model';
import { mmToPx, reportPaperSummary } from '../../utils/coordinate-utils';
import { ValidationContext } from '../../../../core/models/fiscal.model';
import { buildValidationContext } from '../../utils/fiscal-context';
import { RenderEvidence } from '../../services/render-evidence';
import { sampleFiscalInvoice } from '../../data/sample-fiscal-invoice';
import { SelectionService } from '../../services/selection.service';
import { RuleResult, RuleStatus } from '../../utils/static-fiscal-rules';
import { inspectFiscalPrint, RenderedFiscalReport } from '../../utils/rendered-fiscal-rules';
import { prepareBrowserPrint } from '../../utils/prepare-browser-print';
import { decideBrowserPrint, isContentValidationFinding } from '../../utils/print-validation-policy';
import { RECEIVER_OMISSION_RULE } from '../../utils/receiver-omissions';
import { buildValidationFeedback, printFailureLabel, ValidationFeedback } from '../../utils/validation-feedback';
import { ValidationFeedbackComponent } from '../validation-feedback/validation-feedback.component';
import { FiscalAdviceComponent } from '../fiscal-advice/fiscal-advice.component';

export type PreviewViewMode = 'render' | 'html' | 'json';

@Component({
  selector: 'app-preview',
  standalone: true,
  imports: [CommonModule, FormsModule, FiscalAdviceComponent, ValidationFeedbackComponent],
  templateUrl: './preview.component.html',
  styleUrl: './preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PreviewComponent implements OnInit, OnDestroy {
  readonly validation = inject(ValidationSessionService, { optional: true });
  renderEvidence?: RenderEvidence;
  renderInputSnapshot = '';
  previewReady = false;
  private injectionVersion = 0;
  private preparation?: Promise<Document | undefined>;
  private preparedDocument?: Document;
  paginationPending?: string;
  private preparedPages: Element[] = [];
  preparedHtml = '';
  @Output() readonly showDesign = new EventEmitter<void>();
  @Input() draft = false;
  renderedReport?: RenderedFiscalReport;
  feedback?: ValidationFeedback;
  reportPending = true;
  readonly isContentFinding = isContentValidationFinding;
  printing = false;
  printMessage = '';
  readonly ruleLabels: Record<RuleStatus, string> = { pass: 'Cumple', fail: 'Incumple', pending: 'Pendiente', 'not-applicable': 'No aplica' };
  @ViewChild('previewFrame') previewFrame!: ElementRef<HTMLIFrameElement>;
  @ViewChild('printValidation') private printValidation?: ElementRef<HTMLDetailsElement>;

  // ─── Render outputs (recomputed on each renderPreview) ───
  previewHtml = '';      // HTML with data resolved
  templateHtml = '';     // HTML with z-code directives (no data)
  templateJson = '';     // JSON of the template definition
  fiscalContext?: ValidationContext;
  showFiscalContext = false;
  readonly fiscalContextFields = [
    { key: 'isCfe', label: 'Es CFE' }, { key: 'cfeType', label: 'Tipo CFE' },
    { key: 'issuerRegime', label: 'Régimen del emisor' }, { key: 'signatureDate', label: 'Fecha de firma' },
    { key: 'signatureHash', label: 'Hash de firma completo' }
  ] as const;

  // ─── View state ───
  viewMode: PreviewViewMode = 'render';
  readonly scenarios = REPORT_SCENARIOS;
  scenario: ScenarioMode = 'single';
  paperSummary = '';
  currentPage = 1;
  sampleSize = 0;
  get pageCount(): number { return this.preparedPages.length; }
  get outputReady(): boolean { return this.previewReady && !this.paginationPending; }

  showPage(index: number): void {
    const page = this.preparedPages[index - 1];
    if (!page) return;
    this.currentPage = index;
    page.scrollIntoView({ block: 'start' });
  }
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
    private cdr: ChangeDetectorRef,
    private selection: SelectionService
  ) {}

  ngOnInit(): void {
    // Re-render preview when template changes (debounced)
    this.templateState.template$
      .pipe(
        skip(1),
        tap(() => this.invalidateReport()),
        debounceTime(300),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        if (!this.fiscalContext || this.renderInputSnapshot !== this.currentSnapshot()) this.renderPreview();
      });
    if (this.validation) {
      this.validation.scenario$.pipe(takeUntil(this.destroy$)).subscribe(mode => {
        this.scenario = mode;
        this.renderPreview();
      });
    } else this.renderPreview();
  }

  ngOnDestroy(): void {
    this.injectionVersion++;
    this.destroy$.next();
    this.destroy$.complete();
    if (this.copyStatusTimeout) clearTimeout(this.copyStatusTimeout);
  }

  private invalidateReport(): void {
    this.injectionVersion++;
    this.preparedPages = [];
    this.currentPage = 1;
    this.previewReady = false;
    this.paginationPending = undefined;
    this.renderedReport = undefined;
    this.feedback = undefined;
    this.fiscalContext = undefined;
    this.reportPending = true;
    this.preparedDocument = undefined;
    this.preparedHtml = '';
    this.printMessage = '';
    this.cdr.markForCheck();
  }

  // ─────────────────────────────────────────────────────────────────
  // Rendering
  // ─────────────────────────────────────────────────────────────────

  /**
   * Recompute the output formats and inject the resolved HTML
   * into the iframe. Called on init, on template change, and when the
   * sample data toggle flips.
   */
  renderPreview(): void {
    this.invalidateReport();
    this.printMessage = '';
    const template = this.templateState.getCurrentTemplate();
    const data = this.getActiveData();
    this.sampleSize = data.invoiceLines?.length ?? 0;
    this.paperSummary = reportPaperSummary(template.page);
    this.fiscalContext = buildValidationContext(template.compliance, data);
    this.showFiscalContext = template.compliance !== undefined || data.fiscal !== undefined;

    this.pageWidthPx = mmToPx(template.page.width);
    this.pageHeightPx = mmToPx(template.page.height);

    // Precompute all formats — cheap and keeps view switching instant
    const artifact = this.renderer.renderWithEvidence(template, data, true);
    this.previewHtml = artifact.html;
    this.renderEvidence = artifact.evidence;
    this.renderInputSnapshot = artifact.inputSnapshot;
    this.templateHtml = this.renderer.exportAsZureoTemplate(template);
    this.templateJson = JSON.stringify(template, null, 2);

    this.injectIframe();

    this.cdr.markForCheck();
  }

  private injectIframe(): void {
    const version = ++this.injectionVersion;
    const html = this.previewHtml;
    const evidence = this.renderEvidence && { ...this.renderEvidence,
      diagnostics: this.renderEvidence.diagnostics.filter(diagnostic => diagnostic.code !== 'resource-error') };
    this.renderEvidence = evidence;
    this.previewReady = false;
    this.reportPending = true;
    this.renderedReport = undefined;
    this.feedback = undefined;
    this.preparation = this.prepareDocument(version, html, evidence).catch(() => {
      if (version === this.injectionVersion) {
        this.previewReady = false;
        this.renderedReport = undefined;
        this.feedback = undefined;
        this.reportPending = false;
        this.printMessage = 'No se pudo preparar la salida. Revisá el molde y los datos y volvé a intentarlo.';
        this.cdr.markForCheck();
      }
      return undefined;
    });
  }

  private async prepareDocument(version: number, html: string, evidence: RenderEvidence | undefined): Promise<Document | undefined> {
    await new Promise(resolve => setTimeout(resolve, 50));
    if (version !== this.injectionVersion) return undefined;
    const doc = this.previewFrame?.nativeElement.contentDocument;
    if (!doc) return undefined;
    doc.open();
    doc.write(html);
    doc.close();
    const template = this.templateState.getCurrentTemplate();
    const context = this.fiscalContext;
    const snapshot = this.renderInputSnapshot;
    if (!evidence || !context) return undefined;
    const prepared = await prepareBrowserPrint(doc, template, context, evidence,
      () => version === this.injectionVersion && snapshot === this.currentSnapshot() &&
        doc === this.previewFrame?.nativeElement.contentDocument);
    if (!prepared) return undefined;
    this.previewReady = prepared.resourcesReady;
    this.paginationPending = prepared.paginationPending;
    this.preparedPages = Array.from(doc.querySelectorAll('body > .page'));
    this.pageHeightPx = measureRenderSurface(doc, mmToPx(template.page.height), template.page.dynamicHeight);
    if (this.outputReady) {
      this.preparedDocument = doc;
      this.preparedHtml = this.serializeDocument(doc);
    } else if (!prepared.resourcesReady) {
      this.printMessage = 'No se pudo preparar la salida. Revisá las fuentes e imágenes y volvé a intentarlo.';
    }
    this.renderedReport = prepared.report;
    this.feedback = buildValidationFeedback(context, prepared.report, snapshot, this.currentSnapshot());
    this.reportPending = false;
    if (this.viewMode === 'render' && this.validation?.requestedPage) {
      this.showPage(this.validation.requestedPage);
      this.validation.requestedPage = undefined;
    }
    this.cdr.markForCheck();
    return doc;
  }

  setViewMode(mode: PreviewViewMode): void {
    this.viewMode = mode;
    this.cdr.markForCheck();
  }

  // ─────────────────────────────────────────────────────────────────
  // Simulation scenarios
  // ─────────────────────────────────────────────────────────────────

  private getActiveData(): InvoiceData {
    if (this.validation) return this.validation.data();
    if (this.scenario.startsWith('fiscal')) {
      return sampleFiscalInvoice(this.templateState.getCurrentTemplate().compliance, this.scenario === 'fiscal-multi');
    }
    if (this.scenario === 'fifteen') return SAMPLE_INVOICE_FIFTEEN;
    return this.scenario === 'multi' ? SAMPLE_INVOICE_MULTILINE : SAMPLE_INVOICE_DATA;
  }

  selectScenario(mode: ScenarioMode): void {
    if (this.validation) {
      this.validation.select(mode);
    } else if (mode !== 'json') {
      this.scenario = mode;
      this.renderPreview();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Print
  // ─────────────────────────────────────────────────────────────────

  private currentSnapshot(): string {
    return JSON.stringify({ template: this.templateState.getCurrentTemplate(), data: this.getActiveData() });
  }

  private currentPreparedDocument(): Document | undefined {
    const doc = this.preparedDocument;
    return this.outputReady && doc && doc === this.previewFrame?.nativeElement.contentDocument &&
      this.renderInputSnapshot === this.currentSnapshot() &&
      doc.fonts.status === 'loaded' &&
      Array.from(doc.images).every(image => image.complete && image.naturalWidth > 0)
      ? doc : undefined;
  }

  private serializeDocument(doc: Document): string {
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  }

  private documentForHtmlOutput(): Document | undefined {
    const doc = this.currentPreparedDocument();
    if (!doc && !this.reportPending && !this.paginationPending) {
      this.previewReady = false;
      this.preparedHtml = '';
      this.printMessage = 'Volvé a preparar la salida antes de descargar o copiar el HTML.';
      this.cdr.markForCheck();
    }
    return doc;
  }

  private refreshFiscalReport(doc: Document): RenderedFiscalReport | undefined {
    if (this.renderInputSnapshot !== this.currentSnapshot() || !this.renderEvidence || !this.fiscalContext) return undefined;
    const resourcesReady = this.previewReady && doc.fonts.status === 'loaded' &&
      Array.from(doc.images).every(image => image.complete && image.naturalWidth > 0);
    const pages = Array.from(doc.querySelectorAll('body > .page'));
    const sequenceChanged = pages.length !== this.preparedPages.length || pages.some((page, index) => page !== this.preparedPages[index]);
    const paginationPending = sequenceChanged ? 'Cambió la composición de hojas desde la preparación de la vista.' : this.paginationPending;
    const report = inspectFiscalPrint(this.templateState.getCurrentTemplate(), this.fiscalContext, doc,
      this.renderEvidence, resourcesReady, paginationPending);
    this.renderedReport = report;
    this.feedback = buildValidationFeedback(this.fiscalContext, report, this.renderInputSnapshot, this.currentSnapshot());
    this.reportPending = false;
    return report;
  }

  locateFinding(element: RuleResult['elements'][number]): void {
    this.selection.select(element.id, element.section);
    this.showDesign.emit();
  }

  showFindingPage(finding: RuleResult): void {
    if (finding.page) this.showPage(finding.page);
  }

  async printPreview(): Promise<void> {
    if (this.printing || this.paginationPending) return;
    this.printing = true;
    this.printMessage = '';
    try {
      if (!this.fiscalContext || this.renderInputSnapshot !== this.currentSnapshot()) this.renderPreview();
      if (this.viewMode !== 'render') {
        this.setViewMode('render');
        this.cdr.detectChanges();
      }
      const snapshot = this.renderInputSnapshot;
      const version = this.injectionVersion;
      const doc = await this.preparation;
      if (version !== this.injectionVersion || snapshot !== this.currentSnapshot() ||
          !doc || doc !== this.previewFrame?.nativeElement.contentDocument) {
        this.printMessage = 'La vista cambió mientras se preparaba. Volvé a imprimir desde la vista actual.';
        return;
      }
      if (this.paginationPending) return;
      if (doc !== this.currentPreparedDocument()) {
        this.previewReady = false;
        this.preparedHtml = '';
        this.printMessage = 'No se pudo preparar la salida. Revisá las fuentes e imágenes y volvé a intentarlo.';
        return;
      }
      const report = this.refreshFiscalReport(doc);
      if (!this.fiscalContext) throw new Error('missing-print-context');
      const decision = decideBrowserPrint(this.fiscalContext, report, snapshot, this.currentSnapshot());
      if (decision.state === 'refresh') {
        this.printMessage = 'La evidencia de impresión cambió. Volvé a preparar la vista actual.';
        return;
      }
      if (decision.state === 'block') {
        this.printMessage = 'Impresión bloqueada. Revisá ' + decision.failures.map(printFailureLabel).join('; ') + '.';
        if (this.printValidation && decision.failures.some(finding => finding.ruleId === RECEIVER_OMISSION_RULE))
          this.printValidation.nativeElement.open = true;
        return;
      }
      doc.defaultView?.print();
    } catch {
      this.printMessage = 'No se pudo preparar la impresión. Volvé a intentarlo desde la vista previa.';
    } finally {
      this.printing = false;
      this.cdr.markForCheck();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Export — download as file
  // ─────────────────────────────────────────────────────────────────

  exportHtmlRendered(): void {
    const doc = this.documentForHtmlOutput();
    if (doc) this.downloadBlob(this.serializeDocument(doc), this.fileName('html'), 'text/html');
  }

  exportHtmlTemplate(): void {
    this.downloadBlob(this.renderer.exportAsZureoTemplate(this.templateState.getCurrentTemplate()), this.fileName('template.html'), 'text/html');
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

  async copyHtmlRendered(): Promise<void> {
    const doc = this.documentForHtmlOutput();
    if (doc) await this.copyToClipboard(this.serializeDocument(doc));
  }

  copyHtmlTemplate(): Promise<void> {
    return this.copyToClipboard(this.renderer.exportAsZureoTemplate(this.templateState.getCurrentTemplate()));
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
