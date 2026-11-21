import { TestBed } from '@angular/core/testing';
import { FiscalData, FiscalRole } from '../../../core/models/fiscal.model';
import { InvoiceData } from '../../../core/models/template.model';
import { createDefaultTemplate } from '../data/default-template';
import { HtmlRendererService } from '../services/html-renderer.service';
import { createElement } from './element-factory';
import { buildValidationContext } from './fiscal-context';
import { confirmedPrintFailures, decideBrowserPrint } from './print-validation-policy';
import { RECEIVER_OMISSION_RULE } from './receiver-omissions';
import { inspectFiscalPrint } from './rendered-fiscal-rules';
import { buildValidationFeedback } from './validation-feedback';

describe('Receiver omissions, adenda and repetition in browser print', () => {
  let frame: HTMLIFrameElement;
  const buyer: FiscalData = {
    schemaVersion: '1.0', isCfe: true, cfeType: 111, issueDate: '2026-11-20', finalConsumer: false,
    exportOperation: false, receiverNonResidentWithoutRut: false, receiverSectorException: false, professionalSecrecy: false,
    receiverDocumentType: 'RUC', receiverDocumentNumber: '219876540012', receiverName: 'Taller del Sur', receiverAddress: 'Av. Italia 123',
    receiverCountry: 'UY', hasWithholdingsOrPerceptions: false
  };
  const ticket: FiscalData = { ...buyer, cfeType: 101, finalConsumer: true, receiverDocumentType: 'CI',
    receiverDocumentNumber: '12345678', netAmount: '30001', currency: 'UYU', uiValue: '6',
    uiValueDate: '2025-12-31', uiValueSource: 'Escenario' };
  interface Options {
    present?: { role: FiscalRole; field?: string; label?: string };
    extra?: Array<{ role: FiscalRole; field: string }>;
    wrong?: string;
    support?: InvoiceData['printSupport'];
    freeText?: string;
    roll?: boolean;
    pages?: number;
    oversizedSheet?: boolean;
    resourcesReady?: boolean;
    paginationPending?: string;
    normalizedPages?: boolean;
    firstSheetNumber?: number;
    removeFromMiddle?: string;
    wrongOnMiddle?: string;
    middleLabel?: 'hidden' | 'duplicate';
    adendaOnlyMiddle?: boolean;
    adenda?: 'within-body' | 'separate-page';
    adendaInHeader?: boolean;
    adendaFieldsWithoutZone?: boolean;
    literalCfeIdentity?: boolean;
    wrongAdendaName?: boolean;
    earlyOptional?: boolean;
    boxWidth?: number;
    fiscalQr?: boolean;
  }
  function inspect(fiscal: FiscalData, options: Options = {}) {
    frame?.remove();
    frame = document.createElement('iframe'); document.body.append(frame);
    const doc = frame.contentDocument!;
    const data: InvoiceData = { invoice: {}, company: {}, invoiceLines: [], fiscal,
      printSupport: options.support ?? { kind: 'blank' } };
    const template = createDefaultTemplate();
    template.sections.header.elements = []; template.sections.detail.elements = []; template.sections.footer.elements = [];
    template.sections.header.height = template.sections.detail.height = template.sections.footer.height = 10;
    if (options.extra?.length) template.sections.header.height = 45;
    if (options.normalizedPages) for (const section of ['header', 'detail', 'footer'] as const) {
      template.sections[section].printOnFirstPage = true;
      template.sections[section].printOnLastPage = true;
      template.sections[section].printOnEveryPage = true;
    }
    if (options.roll) {
      template.page.dynamicHeight = true;
      template.page.width = 80;
    }
    const present = options.present;
    if (present?.field) {
      const field = createElement('dataField');
      if (field.type !== 'dataField') throw new Error('Expected data field');
      field.binding = { source: 'fiscal.' + present.field };
      field.fiscalRoles = [present.role];
      field.position = { x: 1, y: 1 };
      field.size = { width: 65, height: 8 };
      template.sections.header.elements.push(field);
    } else if (present?.label || options.freeText) {
      const text = createElement('text');
      if (text.type !== 'text') throw new Error('Expected text');
      text.content = present?.label ?? options.freeText!;
      text.fiscalRoles = present ? [present.role] : [];
      text.position = { x: 1, y: 1 };
      text.size = { width: 65, height: 8 };
      template.sections.header.elements.push(text);
    }
    if (options.boxWidth !== undefined) {
      const box = createElement('rectangle');
      if (box.type !== 'rectangle') throw new Error('Expected rectangle');
      box.position = { x: 0, y: 0 };
      box.size = { width: options.boxWidth, height: 13 };
      box.fiscalRoles = ['recipient.boundary'];
      template.sections.header.height = 20;
      template.sections.header.elements.unshift(box);
    }
    for (const [index, extra] of (options.extra ?? []).entries()) {
      const field = createElement('dataField');
      if (field.type !== 'dataField') throw new Error('Expected data field');
      field.id = extra.field;
      field.binding = { source: 'fiscal.' + extra.field };
      field.fiscalRoles = [extra.role];
      field.position = { x: 1, y: 12 + 10 * index };
      field.size = { width: 65, height: 8 };
      template.sections.header.elements.push(field);
    }
    if (options.adenda) {
      template.compliance = { schemaVersion: '1.0', jurisdiction: 'UY', output: 'browser',
        cfeType: 111, medium: 'sheet', adendaPlacement: options.adenda };
      template.sections.header.height = 24;
      template.sections.detail.height = 95;
      const identity = createElement(options.literalCfeIdentity ? 'text' : 'dataField');
      const box = createElement('rectangle'), label = createElement('text'), optional = createElement('text');
      if ((identity.type !== 'dataField' && identity.type !== 'text') || box.type !== 'rectangle' || label.type !== 'text' || optional.type !== 'text')
        throw new Error('Unexpected test element');
      if (identity.type === 'dataField') identity.binding = { source: 'fiscal.series' };
      else identity.content = 'A';
      identity.id = 'cfe-identity';
      identity.fiscalRoles = ['document.series'];
      identity.position = { x: 2, y: 2 }; identity.size = { width: 40, height: 8 };
      template.sections.header.elements.push(identity);
      box.position = { x: 15, y: 9 }; box.size = { width: 100, height: 75 };
      box.fiscalRoles = ['adenda.boundary']; box.strokeColor = '#000000';
      label.content = 'ADENDA'; label.fiscalRoles = ['adenda.label']; label.position = { x: 18, y: 12 }; label.size = { width: 75, height: 8 };
      optional.content = 'Descripción libre'; optional.fiscalRoles = ['adenda.content'];
      optional.position = { x: 18, y: options.earlyOptional ? 22 : 67 }; optional.size = { width: 75, height: 8 };
      const section = options.adendaInHeader ? template.sections.header : template.sections.detail;
      if (options.adendaInHeader) section.height = 95;
      section.elements.push(box, label, optional);
      for (const [index, [role, path]] of ([['recipient.document', 'receiverDocumentNumber'],
        ['recipient.name', 'receiverName'], ['recipient.address', 'receiverAddress']] as const).entries()) {
        const field = createElement('dataField');
        if (field.type !== 'dataField') throw new Error('Expected data field');
        field.id = 'adenda-' + path;
        field.binding = { source: 'fiscal.' + path };
        field.fiscalRoles = options.adendaFieldsWithoutZone ? [role] : [role, 'adenda.content'];
        field.position = { x: 18, y: 29 + index * 11 }; field.size = { width: 75, height: 8 };
        section.elements.push(field);
      }
    }
    if (options.fiscalQr) {
      const qr = createElement('qrCode');
      if (qr.type !== 'qrCode') throw new Error('Expected QR field');
      qr.position = { x: 2, y: 2 }; qr.size = { width: 28, height: 28 };
      qr.dataBinding = 'fiscal.qrPayload'; qr.fiscalRoles = ['security.qr'];
      template.sections.footer.height = 34; template.sections.footer.elements.push(qr);
    }
    const artifact = TestBed.inject(HtmlRendererService).renderWithEvidence(template, data, true);
    doc.open(); doc.write(artifact.html); doc.close();
    if (options.wrong) doc.querySelector('[data-render-element]')!.textContent = options.wrong;
    if (options.wrongAdendaName) doc.querySelector('[data-render-element="adenda-receiverName"]')!.textContent = 'Otro destinatario';
    const firstPage = doc.querySelector('body > .page')!;
    if (options.firstSheetNumber !== undefined) firstPage.setAttribute('data-render-page', String(options.firstSheetNumber));
    if (options.adenda === 'separate-page') {
      const adenda = firstPage.cloneNode(false) as HTMLElement;
      const detail = firstPage.querySelector(':scope > .section-detail')!;
      detail.after(detail.cloneNode(false));
      adenda.append(detail);
      doc.body.append(adenda);
    }
    for (let page = 1; page < (options.pages ?? 1); page++) doc.body.append(firstPage.cloneNode(true));
    if (options.normalizedPages) {
      const pages = Array.from(doc.querySelectorAll('body > .page'));
      pages.forEach((page, index) => {
        page.setAttribute('data-render-page', String(index + 1));
        const number = doc.createElement('div');
        number.setAttribute('data-render-page-label', '');
        number.textContent = `Página ${index + 1} de ${pages.length}`;
        page.append(number);
        if (index === 1 && options.middleLabel === 'hidden') number.style.visibility = 'hidden';
        if (index === 1 && options.middleLabel === 'duplicate') {
          const duplicate = number.cloneNode(true) as HTMLElement;
          duplicate.style.display = 'none';
          page.append(duplicate);
        }
      });
      if (options.removeFromMiddle) pages[1].querySelector(`[data-render-element="${options.removeFromMiddle}"]`)!.remove();
      if (options.wrongOnMiddle) pages[1].querySelector(`[data-render-element="${options.wrongOnMiddle}"]`)!.textContent = 'Otro valor';
      if (options.adendaOnlyMiddle) pages[1].querySelector('[data-render-element="cfe-identity"]')!.remove();
    }
    if (options.oversizedSheet) doc.querySelector<HTMLElement>('body > .page')!.style.height = '600mm';
    const context = buildValidationContext(undefined, data);
    const report = inspectFiscalPrint(template, context, doc, artifact.evidence, options.resourcesReady ?? true, options.paginationPending);
    const omissions = report.results.filter(finding => finding.ruleId === RECEIVER_OMISSION_RULE);
    return { report, omissions, context };
  }
  afterEach(() => frame?.remove());

  for (const scenario of [
    { label: 'RUC del comprador', fiscal: buyer, field: 'receiverDocumentNumber', role: 'recipient.document', value: '219876540012' },
    { label: 'nombre del comprador', fiscal: buyer, field: 'receiverName', role: 'recipient.name', value: 'Taller del Sur' },
    { label: 'domicilio del comprador', fiscal: buyer, field: 'receiverAddress', role: 'recipient.address', value: 'Av. Italia 123' },
    { label: 'rótulo del comprador', fiscal: buyer, role: 'recipient.label', printedLabel: 'RUC COMPRADOR', value: 'RUC COMPRADOR' },
    { label: 'rótulo del ticket', fiscal: ticket, role: 'recipient.label', printedLabel: 'CONSUMO FINAL', value: 'CONSUMO FINAL' },
    { label: 'documento del ticket', fiscal: ticket, field: 'receiverDocumentNumber', role: 'recipient.document', value: '12345678' },
    { label: 'país emisor del ticket', fiscal: ticket, field: 'receiverCountry', role: 'recipient.country', value: 'UY' }
  ] as const) {
    it(`distinguishes presence, confirmed absence and unresolved coverage for ${scenario.label}`, () => {
      const isTarget = (finding: { omission?: { coverage: { role: string } } }) => finding.omission?.coverage.role === scenario.role;
      const present = inspect(scenario.fiscal, { present: { role: scenario.role, field: 'field' in scenario ? scenario.field : undefined,
        label: 'printedLabel' in scenario ? scenario.printedLabel : undefined }, roll: scenario.fiscal === ticket });
      expect(present.omissions.some(isTarget)).toBeFalse();
      expect(present.report.receiverCoverage?.find(row => row.role === scenario.role)?.evidenceIds.length).toBeGreaterThan(0);
      const absent = inspect(scenario.fiscal, { roll: scenario.fiscal === ticket });
      expect(absent.omissions.find(isTarget)).toEqual(jasmine.objectContaining({ page: 1, status: 'fail', evidenceIds: [], elements: [] }));
      expect(decideBrowserPrint(absent.context, absent.report, 'same', 'same').failures.some(isTarget)).toBeTrue();
      const ambiguous = inspect(scenario.fiscal, { freeText: scenario.value });
      expect(ambiguous.omissions.some(isTarget)).toBeFalse();
      expect(ambiguous.report.receiverCoverage?.find(row => row.role === scenario.role)?.state).toBe('partial');
      expect(decideBrowserPrint(ambiguous.context, ambiguous.report, 'same', 'same').state).toBe('allow');
    });
  }

  it('keeps existing wrong-value findings separate and blocks on omissions with verifiable field and page evidence', () => {
    const { report, context, omissions } = inspect(buyer);
    expect(omissions.length).toBe(4);
    expect(new Set(omissions.map(finding => finding.findingId)).size).toBe(4);
    expect(report.results.some(finding => finding.ruleId === 'REC-FIELD.name')).toBeFalse();
    const feedback = buildValidationFeedback(context, report, 'same', 'same');
    const item = feedback.groups.find(group => group.key === 'receiver')!.findings.find(row => row.finding.ruleId === RECEIVER_OMISSION_RULE);
    expect(item).toEqual(jasmine.objectContaining({ confirmed: true, blocking: true, prominent: true }));
    expect(feedback.receiverMode).toBe('RUC del comprador');
    expect(confirmedPrintFailures(report)).toEqual(omissions);
    expect(decideBrowserPrint(context, report, 'old', 'same').state).toBe('refresh');
    expect(buildValidationFeedback(context, report, 'old', 'same').groups).toEqual([]);

    const omission = omissions[0], proof = omission.omission!;
    for (const result of [
      { ...omission, omission: undefined },
      { ...omission, status: 'pending' as const, severity: 'error' as const },
      { ...omission, page: 2 },
      { ...omission, fieldPath: 'receiverCountry' },
      { ...omission, omission: { ...proof, coverage: { ...proof.coverage, state: 'partial' as const } } },
      { ...omission, omission: { ...proof, coverage: { ...proof.coverage, evidenceIds: ['present'] } } },
      { ...omission, omission: { ...proof, requirement: { ...proof.requirement, applicability: 'pending' as const } } }
    ]) {
      expect(decideBrowserPrint(context, { ...report, results: [result] }, 'same', 'same').state).toBe('allow');
    }

    const wrong = inspect(buyer, { present: { role: 'recipient.name', field: 'receiverName' }, wrong: 'Otra empresa' });
    expect(wrong.omissions.some(finding => finding.fieldPath === 'receiverName')).toBeFalse();
    expect(confirmedPrintFailures(wrong.report).some(finding => finding.ruleId === 'REC-FIELD.name')).toBeTrue();
  });

  it('uses the resolved ticket threshold and retention condition without transferring invoice duties', () => {
    const limit = inspect({ ...ticket, cfeType: 102, netAmount: '30000' });
    expect(limit.omissions.map(finding => finding.fieldPath)).toEqual(['recipient.label']);
    const retained = inspect({ ...ticket, cfeType: 103, uiValue: undefined, hasWithholdingsOrPerceptions: true });
    expect(retained.omissions.map(finding => finding.fieldPath)).toEqual(['receiverDocumentNumber', 'receiverCountry', 'recipient.label']);
    expect(inspect({ ...buyer, cfeType: 113, netAmount: '0' }).omissions.some(finding => finding.fieldPath === 'receiverCountry')).toBeFalse();
  });

  it('abstains for unknown values, relevant preprint, exceptions and unready or multiple pages', () => {
    const unknown = inspect({ ...buyer, receiverDocumentNumber: undefined });
    expect(unknown.omissions.some(finding => finding.fieldPath === 'receiverDocumentNumber')).toBeFalse();
    const preprinted = inspect(buyer, { support: { kind: 'preprinted', pages: [{ page: 1, roles: ['recipient.document'] }] } });
    expect(preprinted.omissions.some(finding => finding.fieldPath === 'receiverDocumentNumber')).toBeFalse();
    expect(preprinted.omissions.some(finding => finding.fieldPath === 'receiverName')).toBeTrue();
    expect(inspect({ ...buyer, professionalSecrecy: true }).omissions).toEqual([]);
    expect(inspect({ ...buyer, cfeType: 181 }).omissions).toEqual([]);
    expect(inspect({ ...ticket, receiverDocumentType: 'RUC' }).omissions).toEqual([]);
    expect(inspect(buyer, { pages: 2 }).omissions).toEqual([]);
    expect(inspect(buyer, { resourcesReady: false }).omissions).toEqual([]);
    expect(inspect(buyer, { paginationPending: 'Saltos pendientes' }).omissions).toEqual([]);
  });

  it('requires a verified single sheet, a known issue date and a resolved ordinary operation', () => {
    const oversized = inspect(buyer, { oversizedSheet: true });
    expect(oversized.report.results.find(finding => finding.ruleId === 'TEC-04')?.status).toBe('pending');
    expect(oversized.omissions).toEqual([]);
    const remaining = inspect(buyer, { firstSheetNumber: 2 });
    expect(remaining.omissions).toEqual([]);
    expect(remaining.report.receiverCoverage?.find(row => row.role === 'recipient.document')).toEqual(
      jasmine.objectContaining({ state: 'partial', inspected: false }));
    expect(decideBrowserPrint(remaining.context, remaining.report, 'same', 'same').state).toBe('allow');
    expect(inspect({ ...buyer, issueDate: undefined }).omissions).toEqual([]);
    expect(inspect({ ...buyer, exportOperation: undefined }).omissions).toEqual([]);
    expect(inspect({ ...buyer, exportOperation: true }).omissions).toEqual([]);
    expect(inspect({ ...ticket, receiverDocumentType: undefined }).omissions).toEqual([]);
    expect(inspect({ ...ticket, receiverDocumentType: undefined, receiverDocumentNumber: 1234 as unknown as string }).omissions).toEqual([]);
    expect(inspect({ ...ticket, receiverDocumentType: undefined, receiverDocumentNumber: undefined, netAmount: '1' })
      .omissions.map(finding => finding.fieldPath)).toEqual(['recipient.label']);
  });

  it('leaves a value reused in another fiscal binding pending without attributing it to the missing role', () => {
    const shared = inspect({ ...buyer, receiverAddress: 'Domicilio de Taller del Sur' },
      { present: { role: 'recipient.address', field: 'receiverAddress' } });
    const name = shared.report.receiverCoverage?.find(row => row.role === 'recipient.name');
    expect(name).toEqual(jasmine.objectContaining({ state: 'partial', evidenceIds: [] }));
    expect(name?.reason).toContain('Otro campo visible');
    expect(shared.omissions.map(finding => finding.fieldPath)).toEqual(['receiverDocumentNumber', 'recipient.label']);
  });

  it('identifies the one missing repeated field in the middle of three resolved CFE pages', () => {
    const result = inspect(buyer, { pages: 3, normalizedPages: true, removeFromMiddle: 'receiverDocumentNumber',
      extra: [{ role: 'recipient.document', field: 'receiverDocumentNumber' }, { role: 'recipient.name', field: 'receiverName' }] });
    expect(result.omissions.map(finding => [finding.fieldPath, finding.page])).toEqual([['receiverDocumentNumber', 2]]);
    expect(result.report.results.filter(finding => finding.ruleId === 'REC-REPEAT' && finding.status === 'pass').length).toBe(5);
    const decision = decideBrowserPrint(result.context, result.report, 'same', 'same');
    expect(decision.state).toBe('block');
    expect(decision.failures).toEqual(result.omissions);
  });

  it('repeats only document and country on identified ticket sheets and abstains for a relevant preprint', () => {
    const result = inspect(ticket, { pages: 3, normalizedPages: true, removeFromMiddle: 'receiverCountry',
      extra: [{ role: 'recipient.document', field: 'receiverDocumentNumber' }, { role: 'recipient.country', field: 'receiverCountry' }],
      support: { kind: 'preprinted', pages: [{ page: 1, roles: [] }, { page: 2, roles: ['recipient.country'] }, { page: 3, roles: [] }] } });
    expect(result.omissions).toEqual([]);
    expect(result.report.results.filter(finding => finding.ruleId === 'REC-REPEAT' && finding.status === 'pass').length).toBe(5);
    expect(result.report.results.some(finding => finding.ruleId === 'REC-REPEAT' && finding.status === 'pending' && finding.page === 2)).toBeTrue();
    expect(decideBrowserPrint(result.context, result.report, 'same', 'same').state).toBe('allow');
  });

  for (const middleLabel of ['hidden', 'duplicate'] as const) {
    it(`keeps repetition pending with a ${middleLabel} page number`, () => {
      const result = inspect(buyer, { pages: 3, normalizedPages: true, middleLabel, removeFromMiddle: 'receiverDocumentNumber',
        extra: [{ role: 'recipient.document', field: 'receiverDocumentNumber' }, { role: 'recipient.name', field: 'receiverName' }] });
      expect(result.omissions).toEqual([]);
      expect(result.report.results.filter(finding => finding.ruleId === 'REC-REPEAT'))
        .toEqual([jasmine.objectContaining({ status: 'pending', page: undefined })]);
      expect(decideBrowserPrint(result.context, result.report, 'same', 'same').state).toBe('allow');
    });
  }

  it('does not turn document-wide address evidence into a blocker per sheet', () => {
    const result = inspect(buyer, { pages: 3, normalizedPages: true, wrongOnMiddle: 'receiverAddress',
      extra: [{ role: 'recipient.document', field: 'receiverDocumentNumber' }, { role: 'recipient.name', field: 'receiverName' },
        { role: 'recipient.address', field: 'receiverAddress' }] });
    expect(result.report.results.find(finding => finding.ruleId === 'REC-FIELD.address' && finding.page === 2)?.status).toBe('pending');
    expect(result.report.results.filter(finding => finding.ruleId === 'REC-REPEAT' && finding.status === 'pass').length).toBe(6);
    expect(result.omissions).toEqual([]);
    expect(decideBrowserPrint(result.context, result.report, 'same', 'same').state).toBe('allow');
  });

  it('keeps a multipage ticket pending when its document type is unknown or indicates RUC', () => {
    for (const receiverDocumentType of [undefined, '2', 'RUC']) {
      const result = inspect({ ...ticket, receiverDocumentType }, { pages: 3, normalizedPages: true,
        wrongOnMiddle: 'receiverDocumentNumber', extra: [
          { role: 'recipient.document', field: 'receiverDocumentNumber' }, { role: 'recipient.country', field: 'receiverCountry' }
        ] });
      const rule = receiverDocumentType === undefined ? 'REC-REPEAT' : 'REC-EXCEPTION';
      expect(result.report.results.find(finding => finding.ruleId === rule)?.status).toBe('pending');
      expect(result.report.results.some(finding => finding.ruleId === 'REC-REPEAT' && finding.status === 'pass')).toBeFalse();
      expect(result.omissions).toEqual([]);
      expect(decideBrowserPrint(result.context, result.report, 'same', 'same').state).toBe('allow');
    }
  });

  it('checks resolved export and withholding duties without importing ordinary buyer duties', () => {
    const exported = inspect({ ...ticket, exportOperation: true, operationType: 'services' });
    expect(exported.omissions.map(finding => finding.fieldPath)).toEqual(['receiverName', 'receiverAddress']);
    const withheld = inspect({ ...ticket, cfeType: 182, receiverIsIndividual: true, hasWithholdingsOrPerceptions: true });
    expect(withheld.omissions.map(finding => finding.fieldPath)).toEqual(['receiverName', 'receiverDocumentNumber']);
    expect(inspect({ ...ticket, cfeType: 182, receiverIsIndividual: true, fiscalCreditAmount: '120' }).omissions).toEqual([]);
    const mixed = inspect({ ...ticket, cfeType: 182, receiverIsIndividual: true, hasWithholdingsOrPerceptions: true, fiscalCreditAmount: '120' });
    expect(mixed.report.receiverObligations?.branch).toBe('unresolved');
    expect(mixed.report.results.find(finding => finding.ruleId === 'REC-EXCEPTION')?.status).toBe('pending');
    expect(mixed.omissions).toEqual([]);
    expect(decideBrowserPrint(mixed.context, mixed.report, 'same', 'same').state).toBe('allow');
    const multiExport = inspect({ ...ticket, exportOperation: true, operationType: 'services' }, { pages: 2 });
    expect(multiExport.report.results.some(finding => finding.ruleId === 'REC-REPEAT')).toBeFalse();
  });

  it('checks the nonresident alternative as a group and keeps a partial composition pending', () => {
    const foreign = { ...ticket, receiverNonResidentWithoutRut: true, receiverIsIndividual: false, netAmount: '100' };
    const name = { role: 'recipient.name' as const, field: 'receiverName' };
    expect(inspect(foreign, { present: name }).report.results.find(finding => finding.ruleId === 'REC-EXCEPTION')?.status).toBe('pending');
    const complete = inspect(foreign, { present: name, extra: [{ role: 'recipient.address', field: 'receiverAddress' }] });
    expect(complete.report.results.find(finding => finding.ruleId === 'REC-EXCEPTION')?.status).toBe('pass');
    expect(complete.omissions).toEqual([]);
    const label = { role: 'recipient.label' as const, label: 'CONSUMO FINAL' };
    const box = inspect(foreign, { present: label, boxWidth: 70 });
    expect(box.report.results.find(finding => finding.ruleId === 'REC-EXCEPTION')?.status).toBe('pass');
    const small = inspect(foreign, { present: label, boxWidth: 36 });
    expect(small.report.results.find(finding => finding.ruleId === 'REC-EXCEPTION')?.status).toBe('pending');
    expect(confirmedPrintFailures(small.report).some(finding => finding.ruleId === 'REC-BOX')).toBeFalse();
  });

  it('recognizes the association and priority on an identified adenda and abstains for ambiguous order', () => {
    const secret = { ...buyer, series: 'A', professionalSecrecy: true };
    const within = inspect(secret, { adenda: 'within-body' });
    const withinFinding = within.report.results.find(finding => finding.ruleId === 'REC-SECRECY');
    expect(withinFinding?.status).withContext(withinFinding?.message ?? '').toBe('pass');
    expect(within.omissions).toEqual([]);
    const withQr = inspect({ ...secret, qrPayload: 'QR sintético para medir separación' }, { adenda: 'within-body', fiscalQr: true });
    expect(withQr.report.results.find(finding => finding.ruleId === 'REC-SECRECY')?.status).toBe('pass');
    const separate = inspect(secret, { adenda: 'separate-page' });
    const separateFinding = separate.report.results.find(finding => finding.ruleId === 'REC-SECRECY');
    expect(separateFinding).withContext(separateFinding?.message ?? '').toEqual(jasmine.objectContaining({ status: 'pass', page: 2 }));
    expect(separate.omissions).toEqual([]);
    const early = inspect(secret, { adenda: 'within-body', earlyOptional: true });
    expect(early.report.results.find(finding => finding.ruleId === 'REC-SECRECY')?.status).toBe('pending');
    expect(decideBrowserPrint(early.context, early.report, 'same', 'same').state).toBe('allow');
  });

  it('leaves normative and geometric alternatives pending without letting the adenda stand in for the header', () => {
    const secret = { ...buyer, series: 'A', professionalSecrecy: true };
    const legitimateHeader = inspect(secret, {
      extra: [{ role: 'recipient.document', field: 'receiverDocumentNumber' }, { role: 'recipient.name', field: 'receiverName' },
        { role: 'recipient.address', field: 'receiverAddress' }]
    });
    expect(legitimateHeader.report.results.find(finding => finding.ruleId === 'REC-SECRECY')?.status).toBe('pass');
    for (const result of [
      inspect(secret, { adenda: 'within-body', adendaInHeader: true, adendaFieldsWithoutZone: true }),
      inspect(secret, { adenda: 'within-body', literalCfeIdentity: true }),
      inspect(secret, { adenda: 'separate-page', literalCfeIdentity: true }),
      inspect({ ...secret, issueDate: '2023-07-05' }, { adenda: 'within-body' }),
      inspect({ ...secret, issueDate: '2019-03-19' }, { adenda: 'within-body' })
    ]) {
      expect(result.report.results.find(finding => finding.ruleId === 'REC-SECRECY')?.status).toBe('pending');
      expect(result.omissions).toEqual([]);
      expect(decideBrowserPrint(result.context, result.report, 'same', 'same').state).toBe('allow');
    }
  });

  it('does not use text inside the adenda as ordinary receiver evidence or as a wrong-value blocker', () => {
    const options = { adenda: 'within-body' as const, adendaFieldsWithoutZone: true };
    const wrong = inspect({ ...buyer, series: 'A' }, { ...options, wrongAdendaName: true });
    expect(wrong.report.results.find(finding => finding.ruleId === 'REC-FIELD.name')?.status).toBe('pending');
    expect(wrong.omissions.some(finding => finding.fieldPath === 'receiverName')).toBeFalse();
    expect(decideBrowserPrint(wrong.context, wrong.report, 'same', 'same').state).toBe('allow');
    const foreign = inspect({ ...ticket, series: 'A', receiverNonResidentWithoutRut: true, receiverIsIndividual: false, netAmount: '100' }, options);
    expect(foreign.report.results.find(finding => finding.ruleId === 'REC-EXCEPTION')?.status).toBe('pending');
    expect(decideBrowserPrint(foreign.context, foreign.report, 'same', 'same').state).toBe('allow');
  });

  it('leaves repetition pending when a numbered sheet contains only the adenda', () => {
    const result = inspect({ ...buyer, series: 'A' }, { pages: 3, normalizedPages: true, adenda: 'within-body', adendaOnlyMiddle: true });
    expect(result.report.results.filter(finding => finding.ruleId === 'REC-REPEAT'))
      .toEqual([jasmine.objectContaining({ status: 'pending', page: undefined })]);
    expect(result.omissions).toEqual([]);
    expect(decideBrowserPrint(result.context, result.report, 'same', 'same').state).toBe('allow');
  });
});
