import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, Input, OnChanges, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { FiscalAdviceService } from '../../services/fiscal-advice.service';
import { RuleStatus } from '../../utils/static-fiscal-rules';

@Component({
  selector: 'app-fiscal-advice',
  standalone: true,
  imports: [AsyncPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if ((status === 'fail' || status === 'pending') && (ruleIds$ | async)?.includes(ruleId)) {
      <div class="advice">
        @if (!explanation) {
          <button type="button" (click)="explain()" [disabled]="loading">
            {{ loading ? 'Consultando…' : 'Explicar con IA' }}
          </button>
        }
        @if (unavailable) {
          <p role="status">La explicación no está disponible ahora. Podés seguir el próximo paso del informe.</p>
        }
        @if (explanation) {
          <p class="explanation" role="status"><strong>Orientación de IA</strong><br>{{ explanation }}</p>
        }
      </div>
    }
  `,
  styles: `
    .advice { margin-top: .5rem; }
    button { font: inherit; cursor: pointer; }
    .explanation { white-space: pre-wrap; border-left: 3px solid #557ca6; padding-left: .75rem; }
  `
})
export class FiscalAdviceComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) ruleId!: string;
  @Input({ required: true }) status!: RuleStatus;
  private readonly service = inject(FiscalAdviceService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly ruleIds$ = this.service.ruleIds$;
  private request?: Subscription;
  loading = false;
  unavailable = false;
  explanation = '';

  ngOnChanges(): void {
    this.request?.unsubscribe();
    this.explanation = '';
    this.unavailable = false;
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.request?.unsubscribe();
  }

  explain(): void {
    if (this.loading || (this.status !== 'fail' && this.status !== 'pending')) return;
    this.loading = true;
    this.unavailable = false;
    this.request = this.service.explain(this.ruleId, this.status).subscribe({
      next: response => {
        this.explanation = typeof response?.explanation === 'string' ? response.explanation.trim() : '';
        this.finish(!this.explanation);
      },
      error: () => this.finish(true)
    });
  }

  private finish(unavailable: boolean): void {
    this.loading = false;
    this.unavailable = unavailable;
    this.cdr.markForCheck();
  }
}
