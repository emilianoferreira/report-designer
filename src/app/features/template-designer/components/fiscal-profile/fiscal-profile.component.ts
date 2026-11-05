import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CFE_TYPES, FISCAL_REGIMES, FiscalProfile } from '../../../../core/models/fiscal.model';
import { TemplateStateService } from '../../services/template-state.service';

@Component({
  selector: 'app-fiscal-profile', standalone: true, imports: [AsyncPipe, FormsModule],
  templateUrl: './fiscal-profile.component.html', styleUrl: './fiscal-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FiscalProfileComponent {
  readonly cfeTypes = CFE_TYPES;
  readonly regimes = FISCAL_REGIMES;
  get template$() { return this.state.template$; }
  constructor(public state: TemplateStateService) {}

  configure(): void {
    this.state.updateFiscalProfile({ schemaVersion: '1.0', jurisdiction: 'UY', output: 'browser' });
  }
  change<K extends keyof FiscalProfile>(key: K, value: FiscalProfile[K]): void {
    const profile = this.state.getCurrentTemplate().compliance;
    if (!profile) return;
    const next = { ...profile, [key]: value };
    if (value === undefined) delete next[key];
    this.state.updateFiscalProfile(next);
  }
  isSupportedProfile(profile: FiscalProfile): boolean {
    return profile.schemaVersion === '1.0' && profile.jurisdiction === 'UY' && profile.output === 'browser';
  }
  isListedType(value: number | undefined): boolean { return CFE_TYPES.some(t => t.value === value); }
  isListedRegime(value: string | undefined): boolean { return FISCAL_REGIMES.some(r => r.value === value); }
}
