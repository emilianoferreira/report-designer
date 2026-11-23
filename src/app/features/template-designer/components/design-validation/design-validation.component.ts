import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Output, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ValidationSessionService, ScenarioMode, REPORT_SCENARIOS } from '../../services/validation-session.service';
import { SelectionService } from '../../services/selection.service';
import { RuleResult } from '../../utils/static-fiscal-rules';
import { isContentValidationFinding } from '../../utils/print-validation-policy';
import { ValidationFeedbackComponent } from '../validation-feedback/validation-feedback.component';

@Component({
  selector: 'app-design-validation', standalone: true, imports: [AsyncPipe, FormsModule, ValidationFeedbackComponent], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details open><summary>Validaciones del diseño</summary>
      <label>Escenario <select aria-label="Escenario de validación" [ngModel]="session.scenario$ | async" (ngModelChange)="select($event)">
        @for (scenario of scenarios; track scenario.mode) {
          <option [value]="scenario.mode" [disabled]="scenario.mode === 'json' && !session.hasImportedScenario">{{ scenario.label }}</option>
        }
      </select></label>
      <label>Cargar InvoiceData JSON <input type="file" accept=".json,application/json" (change)="importFile($event)" /></label>
      <p>Los datos se usan en memoria y también en Vista Previa. No se guardan en el molde.</p>
      @if (error) { <p role="alert">{{ error }}</p> }
      @if (session.pending$ | async) { <p role="status">Actualizando; los resultados anteriores ya no están vigentes.</p> }
      @else { @if (session.report$ | async; as report) {
        @if (session.feedback$ | async; as feedback) {
          <app-validation-feedback [feedback]="feedback" (locate)="locate($event)" (preview)="preview($event)" />
        }
        @for (finding of report.results; track finding.findingId) {
          @if (!isContentFinding(finding) && (finding.status === 'fail' || (finding.status === 'pending' && finding.severity === 'warning'))) {
            <article [class.error]="finding.status === 'fail'">
              <strong>{{ finding.title }} · {{ finding.status === 'fail' ? 'Confirmado' : 'Advertencia pendiente' }}</strong>
              <p>{{ finding.category === 'technical' ? 'Técnico' : 'DGI' }} · {{ finding.message }}</p><p>{{ finding.action }}</p>
              @if (finding.source) { <a [href]="finding.source" target="_blank" rel="noopener noreferrer">{{ finding.reference }}</a> }
              @for (element of finding.elements; track element.id) { <button (click)="locate(element)">Seleccionar {{ element.id }}</button> }
              <button (click)="preview(finding)">Ver página en Vista Previa</button>
            </article>
          }
        }
        <details><summary>Todos los controles y pendientes</summary>
          @for (finding of report.results; track finding.findingId) { @if (!isContentFinding(finding)) { <p>{{ finding.id }} · {{ finding.status }} · {{ finding.message }}</p> } }
        </details>
      } @else { <p role="status">No se pudo preparar el análisis; revisá el escenario y sus recursos.</p> } }
    </details>`,
  styles: `:host{display:block;padding:10px;font-size:12px}p{line-height:1.4}label{display:block;margin:8px 0}select,input{max-width:100%}article{border-left:3px solid #bb8700;padding:8px;margin:8px 0;background:#fff7df}article.error{border-color:#b52e36;background:#fff0f0}button{margin:4px;overflow-wrap:anywhere;max-width:100%}`
})
export class DesignValidationComponent {
  readonly isContentFinding = isContentValidationFinding;
  @Output() readonly showPreview = new EventEmitter<void>();
  readonly session = inject(ValidationSessionService);
  readonly scenarios = REPORT_SCENARIOS;
  private selection = inject(SelectionService);
  private cdr = inject(ChangeDetectorRef);
  private document = inject(DOCUMENT);
  error = '';
  select(mode: ScenarioMode): void { this.session.select(mode); }
  locate(element: RuleResult['elements'][number]): void {
    this.selection.select(element.id, element.section);
    Array.from(this.document.querySelectorAll<HTMLElement>('[data-element-id]'))
      .find(node => node.dataset['elementId'] === element.id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  preview(finding: RuleResult): void { this.session.requestedPage = finding.page; this.showPreview.emit(); }
  async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0]; if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('El archivo supera el límite de 2 MB.');
      this.session.importJson(await file.text()); this.error = '';
    } catch (error) { this.error = error instanceof Error ? error.message : 'JSON inválido.'; }
    input.value = '';
    this.cdr.markForCheck();
  }
}
