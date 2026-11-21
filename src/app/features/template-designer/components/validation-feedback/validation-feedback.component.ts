import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RuleResult } from '../../utils/static-fiscal-rules';
import { FISCAL_ROLE_LABELS } from '../../../../core/models/fiscal.model';
import { FeedbackGroup, ValidationFeedback } from '../../utils/validation-feedback';

/** Deterministic content feedback shared by designer and preview. No advice service or output mutation. */
@Component({
  selector: 'app-validation-feedback', standalone: true, imports: [NgTemplateOutlet], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-label="Controles del contenido fiscal">
      <p role="status">{{ feedback.message }}</p>
      <p>{{ feedback.typeLabel }} @if (feedback.matrixVersion) { · Matriz {{ feedback.matrixVersion }} }</p>
      <p>Se evalúa este escenario del navegador. Un valor verificado no certifica el comprobante ni la salida de Zureo.</p>
      @if (feedback.receiverCoverage?.length) {
        <details data-receiver-coverage>
          <summary>Cobertura del receptor en el HTML de impresión</summary>
          <p>El soporte proviene del escenario. La inspección se limita al documento del navegador.</p>
          <ul>
            @for (row of feedback.receiverCoverage; track row.role + ':' + row.page) {
              <li>
                {{ roleLabels[row.role] }} · {{ row.page ? 'Página ' + row.page : 'Página sin inspeccionar' }} ·
                {{ row.state === 'complete' ? 'Cobertura completa' : 'Cobertura pendiente' }}
                <p>{{ row.reason }}</p>
              </li>
            }
          </ul>
        </details>
      }
      @for (group of feedback.groups; track group.key) {
        <details [attr.data-validation-family]="group.key" [open]="hasProminent(group)">
          <summary>{{ group.title }} · {{ group.confirmed }} confirmado(s) · {{ group.pending }} pendiente(s) · {{ group.verified }} verificado(s)</summary>
          @if (group.key === 'receiver' && feedback.receiverMode) { <p>Modalidad evaluada · {{ feedback.receiverMode }}</p> }
          @for (item of group.findings; track item.finding.findingId) {
            @if (item.prominent) { <ng-container [ngTemplateOutlet]="card" [ngTemplateOutletContext]="{ $implicit: item }" /> }
          }
          <details><summary>Verificados, pendientes y no aplicables</summary>
            @for (item of group.findings; track item.finding.findingId) {
              @if (!item.prominent) { <ng-container [ngTemplateOutlet]="card" [ngTemplateOutletContext]="{ $implicit: item }" /> }
            }
          </details>
        </details>
      }
    </section>
    <ng-template #card let-item>
      <article [attr.data-finding-id]="item.finding.findingId" [class.error]="item.confirmed">
        <strong>{{ item.finding.title }} · {{ item.label }}</strong>
        <p>@if (item.target) { {{ item.target }} · } @if (item.finding.page) { Página {{ item.finding.page }} · }
          {{ item.finding.category === 'technical' ? 'Diagnóstico técnico' : 'Control de representación impresa' }}</p>
        <p>{{ item.finding.message }}</p><p>{{ item.finding.action }}</p>
        @if (item.confirmed && item.finding.omission; as omission) {
          <p>Obligatorio · {{ omission.requirement.reason }}</p>
          <p>Cobertura completa del HTML · {{ omission.coverage.reason }}</p>
          <p>Formato CFE {{ omission.requirement.basis.version }}
            @if (omission.requirement.basis.effectiveFrom) { · Desde {{ omission.requirement.basis.effectiveFrom }} }</p>
        }
        @if (item.finding.source) { <a [href]="item.finding.source" target="_blank" rel="noopener noreferrer">{{ item.finding.reference }}</a> }
        @for (element of item.elements; track element.section + ':' + element.id) {
          <button type="button" (click)="locate.emit(element)">{{ mode === 'designer' ? 'Seleccionar ' + element.id : 'Ir al elemento' }}</button>
        }
        @if (!item.elements.length && item.finding.evidenceIds.length) { <p>Contenido sin selección directa en el molde; revisá la página.</p> }
        @if (mode === 'designer' || item.finding.page) {
          <button type="button" (click)="preview.emit(item.finding)">{{ mode === 'designer' ? 'Ver página en Vista Previa' : 'Ver página' }}</button>
        }
      </article>
    </ng-template>`,
  styles: `:host{display:block;font-size:12px}details{margin:8px 0}summary{cursor:pointer;line-height:1.5}p{line-height:1.4}article{padding:8px;margin:8px 0;border-left:3px solid #bb8700;background:#fff7df}article.error{border-color:#b52e36;background:#fff0f0}button{margin:4px;max-width:100%;overflow-wrap:anywhere}`
})
export class ValidationFeedbackComponent {
  readonly roleLabels = FISCAL_ROLE_LABELS;
  @Input({ required: true }) feedback!: ValidationFeedback;
  @Input() mode: 'designer' | 'preview' = 'designer';
  @Output() readonly locate = new EventEmitter<RuleResult['elements'][number]>();
  @Output() readonly preview = new EventEmitter<RuleResult>();
  hasProminent(group: FeedbackGroup): boolean { return group.findings.some(item => item.prominent); }
}
