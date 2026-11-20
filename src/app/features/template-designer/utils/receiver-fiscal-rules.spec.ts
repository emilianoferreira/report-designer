import { FiscalData, FiscalRole } from '../../../core/models/fiscal.model';
import { buildValidationContext } from './fiscal-context';
import { evaluateReceiverPrint, receiverRequirements, receiverThreshold } from './receiver-fiscal-rules';
import { RenderEvidence } from '../services/render-evidence';
import { inspectRenderedLayout } from './rendered-layout-inspector';
import { inspectFiscalPrint } from './rendered-fiscal-rules';
import { createDefaultTemplate } from '../data/default-template';
import { decideBrowserPrint } from './print-validation-policy';
import { TestBed } from '@angular/core/testing';
import { HtmlRendererService } from '../services/html-renderer.service';
import { createElement } from './element-factory';

describe('Receiver requirements and thresholds', () => {
  const base: FiscalData = { schemaVersion: '1.0', isCfe: true, cfeType: 101, professionalSecrecy: false,
    receiverSectorException: false, exportOperation: false, receiverNonResidentWithoutRut: false, finalConsumer: true,
    currency: 'UYU', issueDate: '2026-11-20', netAmount: '30000', uiValue: '6', uiValueDate: '2025-12-31',
    uiValueSource: 'Fixture oficial declarada', hasWithholdingsOrPerceptions: false };
  const context = (patch: Partial<FiscalData> = {}) => buildValidationContext(undefined,
    { invoice: {}, company: {}, invoiceLines: [], fiscal: { ...base, ...patch } });
  const field = (patch: Partial<FiscalData>, role: FiscalRole) => receiverRequirements(context(patch)).fields.find(f => f.role === role)!;
  it('uses strict boundaries and exact decimal comparison without floating point', () => {
    expect(receiverThreshold(context({ netAmount: '29999.999999999999999' })).exceeded).toBeFalse();
    expect(receiverThreshold(context()).exceeded).toBeFalse();
    expect(receiverThreshold(context({ netAmount: '30000.000000000000001' })).exceeded).toBeTrue();
    expect(field({}, 'recipient.document').applicability).toBe('optional');
    expect(field({ netAmount: '30000.01' }, 'recipient.document').applicability).toBe('required');
  });
  it('uses the document date for the 10000/5000 UI transition', () => {
    expect(receiverThreshold(context({ issueDate: '2022-10-31', uiValueDate: '2021-12-31', netAmount: '60000' })).exceeded).toBeFalse();
    expect(receiverThreshold(context({ issueDate: '2022-10-31', uiValueDate: '2021-12-31', netAmount: '60000.01' })).exceeded).toBeTrue();
    expect(receiverThreshold(context({ issueDate: '2022-11-01', uiValueDate: '2021-12-31', netAmount: '30000.01' })).exceeded).toBeTrue();
  });
  it('abstains for missing, stale, contradictory or inapplicable monetary data', () => {
    for (const patch of [{ currency: 'USD' }, { uiValueDate: '2026-11-20' }, { uiValueSource: undefined },
      { netAmount: '-100000' }, { uiValue: '0' }, { issueDate: undefined }, { issueDate: '2010-01-01' }])
      expect(receiverThreshold(context(patch)).status).toBe('pending');
    const conflicting = context(); conflicting.facts.netAmount = { state: 'conflict', candidates: [] };
    expect(receiverThreshold(conflicting).status).toBe('pending');
  });
  it('requires document and country for withholding regardless of threshold availability', () => {
    const patch = { hasWithholdingsOrPerceptions: true, netAmount: undefined, currency: undefined };
    expect(field(patch, 'recipient.document').applicability).toBe('required');
    expect(field(patch, 'recipient.country').applicability).toBe('required');
    expect(field({ hasWithholdingsOrPerceptions: undefined }, 'recipient.document').applicability).toBe('pending');
  });
  it('selects explicit RUC, export and nonresident entity alternatives without inferring them from text or country', () => {
    expect(field({ finalConsumer: false, receiverDocumentType: 'RUC' }, 'recipient.name').applicability).toBe('required');
    expect(field({ finalConsumer: false, receiverDocumentType: 'RUC' }, 'recipient.label').expected).toBe('RUC COMPRADOR');
    expect(field({ exportOperation: true }, 'recipient.address').applicability).toBe('required');
    expect(field({ exportOperation: true }, 'recipient.document').applicability).toBe('optional');
    expect(field({ receiverNonResidentWithoutRut: true, receiverIsIndividual: false }, 'recipient.label').applicability).toBe('optional');
    expect(field({ receiverNonResidentWithoutRut: true, receiverIsIndividual: false }, 'recipient.name').applicability).toBe('required');
    expect(field({ receiverCountry: 'US', receiverNonResidentWithoutRut: undefined }, 'recipient.name').applicability).toBe('pending');
    expect(field({ receiverNonResidentWithoutRut: true, receiverIsIndividual: undefined }, 'recipient.label').applicability).toBe('pending');
  });
  it('treats resguardo withholdings separately from fiscal credit and unknown recipient classes', () => {
    expect(field({ cfeType: 182, receiverIsIndividual: true, hasWithholdingsOrPerceptions: true }, 'recipient.name').applicability).toBe('required');
    expect(field({ cfeType: 182, receiverIsIndividual: true, hasWithholdingsOrPerceptions: true }, 'recipient.label').applicability).toBe('optional');
    expect(field({ cfeType: 182, receiverIsIndividual: true, hasWithholdingsOrPerceptions: false, fiscalCreditAmount: '20' }, 'recipient.name').applicability).toBe('pending');
  });
  it('keeps exceptions and unknown or conflicting scenarios pending', () => {
    for (const patch of [{ receiverSectorException: true }, { receiverSectorException: undefined },
      { professionalSecrecy: undefined }, { isCfe: false }, { cfeType: 999 }, { receiverNonResidentWithoutRut: true, finalConsumer: false }])
      expect(field(patch, 'recipient.document').applicability).toBe('pending');
    const conflicting = context(); conflicting.facts.finalConsumer = { state: 'conflict', candidates: [] };
    expect(receiverRequirements(conflicting).fields.every(f => f.applicability === 'pending')).toBeTrue();
  });
  it('does not relax identification of a RUC buyer merely because exportOperation is true', () => {
    expect(field({ cfeType: 111, finalConsumer: false, receiverDocumentType: 'RUC', exportOperation: true }, 'recipient.document').applicability).toBe('required');
    expect(field({ cfeType: 111 }, 'recipient.label').applicability).toBe('pending');
  });
  it('uses the historical start date for tickets only and defers special final-consumer RUC cases', () => {
    const patch = { issueDate: '2012-05-08', uiValueDate: '2011-12-31', netAmount: '60000.01' };
    expect(receiverThreshold(context(patch)).exceeded).toBeTrue();
    expect(receiverThreshold(context({ ...patch, issueDate: '2012-05-07' })).status).toBe('pending');
    expect(receiverThreshold(context({ ...patch, cfeType: 181 })).status).toBe('pending');
    expect(field({ finalConsumer: true, receiverDocumentType: 'RUC' }, 'recipient.label').applicability).toBe('pending');
  });

  describe('rendered receiver evidence', () => {
    let frame: HTMLIFrameElement;
    const fixture = (items: Array<{ id: string; text: string; roles: FiscalRole[]; path?: string; style?: string }>, pages = 1, boxWidth?: number) => {
      const evidence: RenderEvidence = { version: '1.0', elements: [], content: [], diagnostics: [] };
      const body = items.map((item, index) => {
        evidence.elements.push({ id: item.id, section: 'header', emitted: true, roles: item.roles });
        evidence.content!.push({ instanceId: 'element:header:' + item.id, origin: 'template', elementId: item.id, section: 'header',
          sourcePaths: item.path ? ['fiscal.' + item.path] : [], roles: item.roles, zones: ['recipient'], emitted: true,
          semanticSource: 'declared', association: 'whole', fields: item.path ? [{ sourcePath: 'fiscal.' + item.path, fiscalPath: item.path, association: 'whole', presentation: 'raw' }] : [] });
        return `<div data-render-element="${item.id}" data-render-section="header" style="position:absolute;left:14px;top:${13 + index * 13}px;${item.style ?? ''}">${item.text}</div>`;
      }).join('');
      if (boxWidth !== undefined) {
        evidence.elements.push({ id: 'box', section: 'header', emitted: true, roles: ['recipient.boundary'] });
        evidence.content!.push({ instanceId: 'element:header:box', origin: 'template', elementId: 'box', section: 'header', sourcePaths: [],
          roles: ['recipient.boundary'], zones: ['recipient'], emitted: true, semanticSource: 'declared', association: 'whole' });
      }
      const box = boxWidth === undefined ? '' : `<div data-render-element="box" style="position:absolute;left:10px;top:10px;width:${boxWidth}mm;height:10mm;border:1px solid black"></div>`;
      frame = document.createElement('iframe'); document.body.append(frame);
      const doc = frame.contentDocument!; doc.open();
      doc.write(`<style>body{margin:0;font:10px Arial}*{box-sizing:border-box}.page{position:relative;width:600px;height:500px}</style>` +
        Array.from({ length: pages }, () => `<div class="page">${box}${body}</div>`).join(''));
      doc.close();
      const layout = inspectRenderedLayout(doc, evidence, { resourcesReady: true });
      return { doc, evidence, layout };
    };
    afterEach(() => frame?.remove());
    it('does not borrow a matching issuer name even if the element also declares a recipient role', () => {
      const { doc, evidence, layout } = fixture([{ id: 'issuer', text: 'Ana', roles: ['recipient.name'], path: 'issuerName' }]);
      const result = evaluateReceiverPrint(context({ exportOperation: true, receiverName: 'Ana' }), doc, evidence, layout);
      expect(result.find(r => r.id === 'REC-FIELD.name')!.status).toBe('pending');
    });
    it('keeps individually bound wrong names visible beside a correct copy', () => {
      const { doc, evidence, layout } = fixture(['Ana', 'Beatriz', 'Carla'].map((text, i) => ({
        id: 'name' + i, text, roles: ['recipient.name'], path: 'receiverName' })));
      const result = evaluateReceiverPrint(context({ exportOperation: true, receiverName: 'Ana' }), doc, evidence, layout);
      const names = result.filter(r => r.id === 'REC-FIELD.name');
      expect(names.map(r => r.status)).toEqual(['pass', 'fail', 'fail']);
      expect(new Set(names.map(r => r.findingId)).size).toBe(3);
    });
    it('abstains when only document punctuation differs or two copies of the label compete for a box', () => {
      const { doc, evidence, layout } = fixture([{ id: 'doc', text: '1.234-5', roles: ['recipient.document'], path: 'receiverDocumentNumber' }]);
      const c = context({ hasWithholdingsOrPerceptions: true, receiverDocumentNumber: '12345' });
      expect(evaluateReceiverPrint(c, doc, evidence, layout).find(r => r.id === 'REC-FIELD.document')!.status).toBe('pending');
      frame.remove();
      const boxes = fixture(['a', 'b'].map(id => ({ id, text: 'CONSUMO FINAL', roles: ['recipient.label'] })), 1, 30);
      expect(evaluateReceiverPrint(context(), boxes.doc, boxes.evidence, boxes.layout).find(r => r.id === 'REC-BOX')!.status).toBe('pending');
    });
    it('does not infer identity from matching text or absence of historical roles', () => {
      const { doc, evidence, layout } = fixture([{ id: 'free', text: 'Ana', roles: [] }]);
      const results = evaluateReceiverPrint(context({ exportOperation: true, receiverName: 'Ana' }), doc, evidence, layout);
      expect(results.find(r => r.id === 'REC-FIELD.name')!.status).toBe('pending');
      expect(results.some(r => r.status === 'fail')).toBeFalse();
    });
    it('accepts a visible actual value with multiple roles, and keeps hidden or composite representations pending', () => {
      const { doc, evidence, layout } = fixture([{ id: 'name', text: 'Ana', roles: ['recipient.name', 'adenda.content'] }]);
      const c = context({ exportOperation: true, receiverName: 'Ana', professionalSecrecy: true });
      expect(evaluateReceiverPrint(c, doc, evidence, layout).find(r => r.id === 'REC-FIELD.name')!.status).toBe('pass');
      doc.querySelector('[data-render-element]')!.setAttribute('style', 'display:none');
      const hidden = inspectRenderedLayout(doc, evidence, { resourcesReady: true });
      expect(evaluateReceiverPrint(c, doc, evidence, hidden).find(r => r.id === 'REC-FIELD.name')!.status).toBe('pending');
    });
    it('confirms a wrong explicit whole field, integrates print blocking and preserves severity independence', () => {
      const { doc, evidence } = fixture([{ id: 'name', text: 'Otra persona', roles: ['recipient.name'], path: 'receiverName' }]);
      const c = context({ exportOperation: true, receiverName: 'Ana' });
      const template = createDefaultTemplate(); template.page.width = 600 / (96 / 25.4); template.page.height = 500 / (96 / 25.4);
      const report = inspectFiscalPrint(template, c, doc, evidence, true);
      const result = report.results.find(r => r.id === 'REC-FIELD.name')!;
      expect(result.status).toBe('fail'); expect(result.evidenceIds.length).toBe(1);
      result.severity = 'warning';
      expect(decideBrowserPrint(c, report, 'same', 'same').state).toBe('block');
      expect(decideBrowserPrint(context({ isCfe: false }), report, 'same', 'same').state).toBe('allow');
    });
    it('does not fail a declared role alone, unknown expected value, masked ID or incomplete resources', () => {
      const { doc, evidence, layout } = fixture([{ id: 'doc', text: '***123', roles: ['recipient.document'], path: 'receiverDocumentNumber' }]);
      const c = context({ hasWithholdingsOrPerceptions: true, receiverDocumentNumber: '123456' });
      expect(evaluateReceiverPrint(c, doc, evidence, layout).some(r => r.status === 'fail')).toBeFalse();
      layout.ready = false;
      expect(evaluateReceiverPrint(c, doc, evidence, layout).some(r => r.status === 'pass' && r.id.startsWith('REC-FIELD'))).toBeFalse();
    });
    it('confirms a wrong unformatted document but abstains for formatting and ambiguous identities', () => {
      const { doc, evidence, layout } = fixture([{ id: 'doc', text: '999', roles: ['recipient.document'], path: 'receiverDocumentNumber' }]);
      const c = context({ hasWithholdingsOrPerceptions: true, receiverDocumentNumber: '123456' });
      expect(evaluateReceiverPrint(c, doc, evidence, layout).find(r => r.id === 'REC-FIELD.document')!.status).toBe('fail');
      evidence.content![0].fields![0].presentation = 'formatted';
      expect(evaluateReceiverPrint(c, doc, evidence, layout).find(r => r.id === 'REC-FIELD.document')!.status).toBe('pending');
      evidence.content![0].fields![0].presentation = 'raw';
      doc.querySelector('.page')!.append(doc.querySelector('[data-render-element]')!.cloneNode(true));
      expect(evaluateReceiverPrint(c, doc, evidence, inspectRenderedLayout(doc, evidence, { resourcesReady: true })).some(r => r.status === 'fail')).toBeFalse();
    });
    it('measures an explicit associated receiver box and avoids declaring a missing box', () => {
      const { doc, evidence, layout } = fixture([{ id: 'label', text: 'CONSUMO FINAL', roles: ['recipient.label'] }], 1, 30);
      expect(evaluateReceiverPrint(context(), doc, evidence, layout).find(r => r.id === 'REC-BOX')!.status).toBe('fail');
      const alternative = doc.createElement('div'); alternative.setAttribute('data-render-element', 'outer');
      alternative.style.cssText = 'position:absolute;left:8px;top:8px;width:60mm;height:15mm;border:1px solid black';
      doc.querySelector('.page')!.prepend(alternative);
      expect(evaluateReceiverPrint(context(), doc, evidence, inspectRenderedLayout(doc, evidence, { resourcesReady: true })).find(r => r.id === 'REC-BOX')!.status).toBe('pending');
      alternative.remove();
      doc.querySelector('[data-render-element="box"]')!.setAttribute('style', 'position:absolute;left:10px;top:10px;width:40mm;height:10mm;border:1px solid black');
      expect(evaluateReceiverPrint(context(), doc, evidence, inspectRenderedLayout(doc, evidence, { resourcesReady: true })).find(r => r.id === 'REC-BOX')!.status).toBe('pass');
      doc.querySelector('[data-render-element="box"]')!.remove();
      expect(evaluateReceiverPrint(context(), doc, evidence, inspectRenderedLayout(doc, evidence, { resourcesReady: true })).find(r => r.id === 'REC-BOX')!.status).toBe('pending');
    });
    it('preserves page-local identities for tickets, sheets and repeated multipage content', () => {
      const { doc, evidence, layout } = fixture([{ id: 'name', text: 'Ana', roles: ['recipient.name'] }], 2);
      const results = evaluateReceiverPrint(context({ exportOperation: true, receiverName: 'Ana' }), doc, evidence, layout).filter(r => r.id === 'REC-FIELD.name');
      expect(results.map(r => r.page)).toEqual([1, 2]);
      expect(results.every(r => r.status === 'pass')).toBeTrue();
      expect(new Set(results.map(r => r.findingId)).size).toBe(2);
      expect(evaluateReceiverPrint(context(), doc, evidence, layout, 'Paginación pendiente').some(r => r.status === 'fail')).toBeFalse();
    });
    it('reads explicit receiver bindings in the current sheet and ticket renderer without changing the template', () => {
      const renderer = TestBed.inject(HtmlRendererService);
      const template = createDefaultTemplate();
      const element = createElement('dataField');
      if (element.type !== 'dataField') throw new Error('Unexpected factory type');
      element.binding = { source: 'fiscal.receiverName' }; element.fiscalRoles = ['recipient.name'];
      element.position = { x: 2, y: 2 }; element.size = { width: 40, height: 8 };
      template.sections.header.elements = [element]; template.sections.footer.elements = [];
      const data = { invoice: {}, company: {}, invoiceLines: [], fiscal: { ...base, exportOperation: true, receiverName: 'Ana' } };
      for (const ticket of [false, true]) {
        template.page.dynamicHeight = ticket;
        if (ticket) template.page.width = 80;
        const before = JSON.stringify(template);
        const artifact = renderer.renderWithEvidence(template, data, true);
        const { doc } = fixture([]); doc.open(); doc.write(artifact.html); doc.close();
        const layout = inspectRenderedLayout(doc, artifact.evidence, { resourcesReady: true });
        expect(evaluateReceiverPrint(buildValidationContext(undefined, data), doc, artifact.evidence, layout).find(r => r.id === 'REC-FIELD.name')!.status).toBe('pass');
        expect(JSON.stringify(template)).toBe(before);
        expect(renderer.exportAsZureoTemplate(template)).not.toContain('REC-FIELD');
        frame.remove();
      }
    });
  });
});
