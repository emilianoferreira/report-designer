import { TestBed } from '@angular/core/testing';
import { StaticFiscalResultsComponent } from './static-fiscal-results.component';
import { TemplateStateService } from '../../services/template-state.service';
import { SelectionService } from '../../services/selection.service';
import { FiscalAdviceService } from '../../services/fiscal-advice.service';
import { of } from 'rxjs';

describe('Static fiscal results panel', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [{ provide: FiscalAdviceService, useValue: { ruleIds$: of([]) } }]
  }));
  it('updates results when the mold changes and filters failures', () => {
    const fixture = TestBed.createComponent(StaticFiscalResultsComponent);
    const state = TestBed.inject(TemplateStateService);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cobertura incompleta');
    state.updateFiscalProfile({ schemaVersion: '1.0', jurisdiction: 'UY', output: 'browser', cfeType: 111, medium: 'sheet' });
    state.updatePageSettings({ width: 50 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Se detectaron problemas');
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.value = 'fail'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    const articles = fixture.nativeElement.querySelectorAll('article');
    expect(articles.length).toBe(1);
    expect(articles[0].textContent).toContain('PAP-01');
    expect(articles[0].querySelector('a').getAttribute('href')).toContain('formato_cfe_v25-2');
  });
  it('locates technical findings and requests the design view', () => {
    const fixture = TestBed.createComponent(StaticFiscalResultsComponent);
    const selection = TestBed.inject(SelectionService);
    const state = TestBed.inject(TemplateStateService);
    const id = state.getElements('header')[0].id;
    spyOn(selection, 'select');
    let requested = false;
    fixture.componentInstance.showDesign.subscribe(() => requested = true);
    fixture.componentInstance.locate({ id, section: 'header' });
    expect(selection.select).toHaveBeenCalledWith(id, 'header');
    expect(requested).toBeTrue();
  });
});
