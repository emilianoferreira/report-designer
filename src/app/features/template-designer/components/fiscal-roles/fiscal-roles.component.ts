import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FiscalRole, FISCAL_ROLE_LABELS } from '../../../../core/models/fiscal.model';
import { TemplateElement } from '../../../../core/models/template.model';
import { TemplateStateService } from '../../services/template-state.service';
import { suggestFiscalRoles } from '../../utils/fiscal-roles';

@Component({
  selector: 'app-fiscal-roles', standalone: true, imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend>Roles fiscales</legend>
      <p>Declaración de la función del elemento. No acredita cumplimiento DGI.</p>
      @for (role of element.fiscalRoles ?? []; track $index) {
        <div class="assigned"><span>{{ label(role) }}</span>
          <button type="button" (click)="remove(role)" [attr.aria-label]="'Quitar rol ' + label(role)">Quitar</button>
        </div>
      } @empty { <p>Sin roles asignados.</p> }
      <label>Agregar rol
        <select #roleSelect aria-label="Agregar rol" [ngModel]="''" (ngModelChange)="add($event); roleSelect.value = ''">
          <option value="">Seleccionar…</option>
          @for (option of options; track option.value) {
            <option [value]="option.value" [disabled]="element.fiscalRoles?.includes(option.value)">{{ option.label }}</option>
          }
        </select>
      </label>
      @for (role of suggestions; track role) {
        <p>Sugerencia por el campo vinculado: {{ label(role) }}.
          <button type="button" (click)="add(role)">Asignar sugerencia</button>
        </p>
      }
    </fieldset>
  `,
  styles: `
    fieldset { margin: 0 0 18px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 4px; min-width: 0; }
    legend { font-weight: 600; } p { font-size: 12px; line-height: 1.5; }
    label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
    select { width: 100%; min-width: 0; padding: 6px; }
    .assigned { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 8px; font-size: 12px; }
    button { cursor: pointer; background: white; border: 1px solid #b5c2d2; border-radius: 3px; padding: 4px; color: #273444; }
  `
})
export class FiscalRolesComponent {
  @Input({ required: true }) element!: TemplateElement;
  @Input({ required: true }) section!: 'header' | 'detail' | 'footer';
  readonly options = Object.entries(FISCAL_ROLE_LABELS).map(([value, label]) => ({ value: value as FiscalRole, label }));
  constructor(private state: TemplateStateService) {}
  get suggestions(): FiscalRole[] { return suggestFiscalRoles(this.element); }
  label(role: FiscalRole): string {
    return Object.prototype.hasOwnProperty.call(FISCAL_ROLE_LABELS, role) ? FISCAL_ROLE_LABELS[role] : `${role} (no reconocido)`;
  }
  add(role: FiscalRole): void {
    if (!Object.prototype.hasOwnProperty.call(FISCAL_ROLE_LABELS, role)) return;
    const current = this.state.getElement(this.section, this.element.id);
    if (!current || current.fiscalRoles?.includes(role)) return;
    this.state.updateElement(this.section, current.id, { fiscalRoles: [...(current.fiscalRoles ?? []), role] });
  }
  remove(role: FiscalRole): void {
    const current = this.state.getElement(this.section, this.element.id);
    if (!current) return;
    this.state.updateElement(this.section, current.id, { fiscalRoles: (current.fiscalRoles ?? []).filter(r => r !== role) });
  }
}
