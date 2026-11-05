import { TestBed } from '@angular/core/testing';
import { FiscalProfileComponent } from './fiscal-profile.component';
import { TemplateStateService } from '../../services/template-state.service';

describe('Fiscal profile editor', () => {
  it('opens a legacy mold without changing it and enables fiscal fields only after an explicit action', async () => {
    const fixture = TestBed.createComponent(FiscalProfileComponent);
    const state = TestBed.inject(TemplateStateService);
    const before = JSON.stringify(state.getCurrentTemplate());
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('no tiene un perfil fiscal');
    expect(JSON.stringify(state.getCurrentTemplate())).toBe(before);
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges(); await fixture.whenStable();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.selectedIndex = 4; // 111, after the empty option and the three ticket types.
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(state.getCurrentTemplate().compliance!.cfeType).toBe(111);
    expect(state.getCurrentTemplate().compliance!.issuerRegime).toBeUndefined();
    state.undo(); state.undo(); fixture.detectChanges();
    expect(JSON.stringify(state.getCurrentTemplate())).toBe(before);
  });
  it('keeps unknown extensions when editing a supported profile', () => {
    const fixture = TestBed.createComponent(FiscalProfileComponent);
    const state = TestBed.inject(TemplateStateService);
    state.updateFiscalProfile({ schemaVersion: '1.0', jurisdiction: 'UY', output: 'browser', cfeType: 181 });
    Object.assign(state.getCurrentTemplate().compliance!, { futureSetting: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('181 — fuera del MVP');
    fixture.componentInstance.change('issuerRegime', 'vat-minimum');
    expect(state.getCurrentTemplate().compliance).toEqual(jasmine.objectContaining({ futureSetting: true, cfeType: 181 }));
  });
  it('shows an unsupported profile without editing or replacing it', () => {
    const fixture = TestBed.createComponent(FiscalProfileComponent);
    const state = TestBed.inject(TemplateStateService);
    const template = state.getCurrentTemplate();
    Object.assign(template, { compliance: { schemaVersion: '2.0', jurisdiction: 'UY', output: 'browser', future: true } });
    state.setTemplate(template);
    const before = JSON.stringify(template);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('no compatible');
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(JSON.stringify(state.getCurrentTemplate())).toBe(before);
  });
});
