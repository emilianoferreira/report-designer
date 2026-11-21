import { TestBed } from '@angular/core/testing';
import { ValidationFeedbackComponent } from './validation-feedback.component';
import { buildValidationFeedback } from '../../utils/validation-feedback';
import { buildValidationContext } from '../../utils/fiscal-context';
import { RuleResult } from '../../utils/static-fiscal-rules';
import { evaluateReceiverOmissions } from '../../utils/receiver-omissions';
import { receiverRequirements } from '../../utils/receiver-requirements';

describe('Shared content feedback', () => {
  it('shows field/page and confirmation, selects each owner once and has no AI controls', () => {
    const finding: RuleResult = { id: 'AMT-FIELD', ruleId: 'AMT-FIELD', findingId: 'amount:one', title: 'Precio unitario', status: 'fail', category: 'normative',
      severity: 'warning', output: 'browser', evidenceIds: ['ink'], page: 2, fieldPath: 'lines.1.unitPrice', message: 'Valor diferente.', action: 'Revisar.', source: '', reference: '',
      elements: [{ id: 'price', section: 'detail' }, { id: 'price', section: 'detail' }] };
    const context = buildValidationContext(undefined, { invoice: {}, company: {}, invoiceLines: [], fiscal: { schemaVersion: '1.0', isCfe: true, cfeType: 111 } });
    const fixture = TestBed.createComponent(ValidationFeedbackComponent);
    fixture.componentRef.setInput('feedback', buildValidationFeedback(context, { scope: 'rendered-browser', results: [finding] }, 'a', 'a'));
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('bloquea impresión del navegador'); expect(host.textContent).toContain('Ítem 2'); expect(host.textContent).toContain('Página 2');
    const buttons = Array.from(host.querySelectorAll('button'));
    expect(buttons.filter(button => button.textContent?.includes('Seleccionar price')).length).toBe(1);
    const locate = spyOn(fixture.componentInstance.locate, 'emit'), preview = spyOn(fixture.componentInstance.preview, 'emit');
    buttons[0].click(); buttons[1].click();
    expect(locate).toHaveBeenCalledWith(finding.elements[0]); expect(preview).toHaveBeenCalledWith(finding);
    expect(host.textContent).not.toContain('Explicar con IA'); expect(host.querySelector('app-fiscal-advice')).toBeNull();
    fixture.componentRef.setInput('mode', 'preview'); fixture.detectChanges(); expect(host.textContent).toContain('Ir al elemento');
  });

  it('shows an omission and its evidence on the affected sheet in both feedback modes', () => {
    const context = buildValidationContext(undefined, { invoice: {}, company: {}, invoiceLines: [], fiscal: {
      schemaVersion: '1.0', isCfe: true, cfeType: 111, issueDate: '2026-11-20', finalConsumer: false,
      receiverDocumentType: 'RUC', receiverDocumentNumber: '219876540012', exportOperation: false,
      receiverNonResidentWithoutRut: false, receiverSectorException: false, professionalSecrecy: false
    } });
    const receiverObligations = receiverRequirements(context);
    const results = evaluateReceiverOmissions(context, receiverObligations, [{
      role: 'recipient.document', fiscalPath: 'receiverDocumentNumber', scope: 'browser-html', page: 2,
      inspected: true, state: 'complete', evidenceIds: [], reasons: [], reason: 'Superficie inspeccionada.'
    }], [1, 2], []);
    const fixture = TestBed.createComponent(ValidationFeedbackComponent);
    fixture.componentRef.setInput('feedback', buildValidationFeedback(context, {
      scope: 'rendered-browser', results, receiverObligations
    }, 'current', 'current'));
    const navigate = spyOn(fixture.componentInstance.preview, 'emit');
    const host = fixture.nativeElement as HTMLElement;
    for (const mode of ['designer', 'preview'] as const) {
      fixture.componentRef.setInput('mode', mode);
      fixture.detectChanges();
      const card = host.querySelector<HTMLElement>('[data-finding-id^="REC-OMISSION:"]')!;
      expect(card.textContent).toContain('Omisión confirmada · bloquea impresión del navegador');
      expect(card.textContent).toContain('Página 2');
      expect(card.textContent).toContain('Obligatorio');
      expect(card.textContent).toContain('Superficie inspeccionada.');
      expect(host.textContent).toContain('Modalidad evaluada · RUC del comprador');
      card.querySelector('button')!.click();
    }
    expect(navigate.calls.allArgs()).toEqual([[results[0]], [results[0]]]);
  });
});
