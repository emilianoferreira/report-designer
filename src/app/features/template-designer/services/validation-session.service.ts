import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, combineLatest, Subscription } from 'rxjs';
import { InvoiceData, ReportTemplate } from '../../../core/models/template.model';
import { TemplateStateService } from './template-state.service';
import { HtmlRendererService } from './html-renderer.service';
import { SAMPLE_INVOICE_DATA, SAMPLE_INVOICE_MULTILINE } from '../data/sample-invoice';
import { sampleFiscalInvoice } from '../data/sample-fiscal-invoice';
import { buildValidationContext } from '../utils/fiscal-context';
import { RenderedFiscalReport } from '../utils/rendered-fiscal-rules';
import { prepareBrowserPrint } from '../utils/prepare-browser-print';
import { buildValidationFeedback, ValidationFeedback } from '../utils/validation-feedback';
import { confirmedPrintFailures } from '../utils/print-validation-policy';

export type ScenarioMode = 'single' | 'multi' | 'fiscal-single' | 'fiscal-multi' | 'json';
/** Scoped to one designer page. Data and results never enter the persisted template. */
@Injectable()
export class ValidationSessionService implements OnDestroy {
  requestedPage?: number;
  readonly scenario$ = new BehaviorSubject<ScenarioMode>('single');
  readonly report$ = new BehaviorSubject<RenderedFiscalReport | undefined>(undefined);
  readonly feedback$ = new BehaviorSubject<ValidationFeedback | undefined>(undefined);
  readonly pending$ = new BehaviorSubject(true);
  private imported?: InvoiceData;
  get hasImportedScenario(): boolean { return this.imported !== undefined; }
  private generation = 0;
  private interacting = false;
  private timer?: ReturnType<typeof setTimeout>;
  private frame?: HTMLIFrameElement;
  private subscription: Subscription;
  constructor(private state: TemplateStateService, private renderer: HtmlRendererService, @Inject(DOCUMENT) private document: Document) {
    this.subscription = combineLatest([state.template$, this.scenario$]).subscribe(([template]) => {
      const version = ++this.generation;
      this.report$.next(undefined); this.feedback$.next(undefined); this.pending$.next(true);
      if (this.timer) clearTimeout(this.timer);
      this.frame?.remove(); this.frame = undefined;
      if (this.interacting) return;
      this.timer = setTimeout(() => void this.prepare(template, version).catch(() => {
        if (version === this.generation) this.pending$.next(false);
      }), 300);
    });
  }
  data(template = this.state.getCurrentTemplate()): InvoiceData {
    const mode = this.scenario$.value;
    if (mode === 'json' && this.imported) return this.imported;
    if (mode.startsWith('fiscal')) return sampleFiscalInvoice(template.compliance, mode.endsWith('multi'));
    return mode === 'multi' ? SAMPLE_INVOICE_MULTILINE : SAMPLE_INVOICE_DATA;
  }
  select(mode: ScenarioMode): void { if (mode !== 'json' || this.imported) this.scenario$.next(mode); }
  beginInteraction(): void {
    this.interacting = true; this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.frame?.remove(); this.frame = undefined;
    this.report$.next(undefined); this.feedback$.next(undefined); this.pending$.next(true);
  }
  endInteraction(): void {
    if (!this.interacting) return;
    this.interacting = false; this.scenario$.next(this.scenario$.value);
  }
  importJson(text: string): void {
    if (text.length > 2_000_000) throw new Error('El escenario supera el límite de 2 MB.');
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Se esperaba un objeto InvoiceData.');
    const value = data as InvoiceData;
    const record = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
    if (!record(value.invoice) || !record(value.company) || !Array.isArray(value.invoiceLines) || !value.invoiceLines.every(record)) {
      throw new Error('InvoiceData requiere invoice, company e invoiceLines válidos.');
    }
    this.imported = value; this.scenario$.next('json');
  }
  affected(id: string): 'error' | 'warning' | undefined {
    const findings = this.report$.value?.results.filter(r => r.elements.some(e => e.id === id));
    if (this.report$.value && confirmedPrintFailures(this.report$.value).some(r => r.elements.some(e => e.id === id))) return 'error';
    return findings?.some(r => r.status === 'pending' && r.severity === 'warning') ? 'warning' : undefined;
  }
  private async prepare(template: ReportTemplate, version: number): Promise<void> {
    const data = this.data(template);
    const artifact = this.renderer.renderWithEvidence(template, data, true);
    const frame = this.document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-same-origin'); frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1500px;height:1000px;border:0;pointer-events:none';
    this.document.body.append(frame); this.frame = frame;
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      doc.open(); doc.write(artifact.html); doc.close();
      const context = buildValidationContext(template.compliance, data);
      const prepared = await prepareBrowserPrint(doc, template, context, artifact.evidence,
        () => version === this.generation && frame.isConnected && artifact.inputSnapshot ===
          JSON.stringify({ template: this.state.getCurrentTemplate(), data: this.data() }));
      if (prepared && version === this.generation) {
        this.report$.next(prepared.report);
        this.feedback$.next(buildValidationFeedback(context, prepared.report, artifact.inputSnapshot,
          JSON.stringify({ template: this.state.getCurrentTemplate(), data: this.data() })));
      }
    } catch {
      if (version === this.generation) { this.report$.next(undefined); this.feedback$.next(undefined); }
    } finally {
      frame.remove();
      if (this.frame === frame) this.frame = undefined;
      if (version === this.generation) this.pending$.next(false);
    }
  }

  ngOnDestroy(): void {
    this.generation++; this.subscription.unsubscribe();
    this.report$.next(undefined); this.feedback$.next(undefined);
    if (this.timer) clearTimeout(this.timer);
    this.frame?.remove();
  }
}
