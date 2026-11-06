import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { map } from 'rxjs';
import { TemplateStateService } from '../../services/template-state.service';
import { SelectionService } from '../../services/selection.service';
import { buildValidationContext } from '../../utils/fiscal-context';
import { evaluateStaticFiscalRules, RuleResult, RuleStatus } from '../../utils/static-fiscal-rules';
import { FiscalAdviceComponent } from '../fiscal-advice/fiscal-advice.component';

@Component({
  selector: 'app-static-fiscal-results', standalone: true, imports: [AsyncPipe, FiscalAdviceComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="results-title">
      <h2 id="results-title">Análisis estático fiscal</h2>
      <p>Diseño actual · Catálogo 0.2 · Impresión desde el navegador</p>
      <p>Se analizan las dimensiones declaradas y la estructura del molde. El contenido impreso,
        la legibilidad y los datos de cada comprobante requieren evidencia adicional.</p>
      @if (report$ | async; as report) {
        <p class="summary" role="status">{{ report.status === 'violations' ? 'Se detectaron problemas' :
          report.status === 'incomplete' ? 'Cobertura incompleta' : 'Sin fallos detectados en el alcance analizado' }}.
          Esto no certifica el cumplimiento DGI.</p>
        <label>Mostrar resultados
          <select aria-label="Filtrar resultados" (change)="filter = $any($event.target).value">
            <option value="all">Todos</option><option value="fail">Incumple</option>
            <option value="pending">Pendiente</option><option value="pass">Cumple</option>
            <option value="not-applicable">No aplica</option>
          </select>
        </label>
        @for (result of report.results; track $index) {
          @if (filter === 'all' || result.status === filter) {
            <article [class.failure]="result.status === 'fail'">
              <h3>{{ result.id }} · {{ result.title }} <span>{{ labels[result.status] }}</span></h3>
              <p>{{ result.category === 'technical' ? 'Diagnóstico técnico' : 'Requisito normativo' }} · {{ result.message }}</p>
              <p><strong>Próximo paso:</strong> {{ result.action }}</p>
              @if (result.source) { <a [href]="result.source" target="_blank" rel="noopener noreferrer">Formato CFE 25.2 · {{ result.reference }}</a> }
              @else { <small>{{ result.reference }}</small> }
              @for (element of result.elements; track $index) {
                <button type="button" (click)="locate(element)">Localizar elemento</button>
              }
              @if (result.category === 'normative') {
                <app-fiscal-advice [ruleId]="result.id" [status]="result.status" />
              }
            </article>
          }
        }
      }
    </section>
  `,
  styles: `
    :host { display: block; width: 100%; overflow: auto; }
    section { max-width: 1000px; margin: auto; padding: 24px; color: #273444; }
    p { line-height: 1.5; } .summary { background: #edf3fa; padding: 14px; font-weight: 600; }
    article { border: 1px solid #cad5e0; background: white; border-radius: 4px; padding: 16px; margin-top: 14px; }
    article.failure { border-left: 4px solid #ac2339; }
    h3 { font-size: 15px; margin-top: 0; } h3 span { display: inline-block; margin-left: 12px; font-weight: normal; }
    select, button { padding: 8px; margin-left: 8px; } a { color: #244b80; }
  `
})
export class StaticFiscalResultsComponent {
  @Output() readonly showDesign = new EventEmitter<void>();
  filter: RuleStatus | 'all' = 'all';
  readonly labels: Record<RuleStatus, string> = { pass: 'Cumple', fail: 'Incumple', pending: 'Pendiente', 'not-applicable': 'No aplica' };
  readonly report$;
  constructor(state: TemplateStateService, private selection: SelectionService) {
    this.report$ = state.template$.pipe(map(template => evaluateStaticFiscalRules(template,
      buildValidationContext(template.compliance, { invoice: {}, invoiceLines: [], company: {} }))));
  }
  locate(element: RuleResult['elements'][number]): void {
    this.selection.select(element.id, element.section);
    this.showDesign.emit();
  }
}
