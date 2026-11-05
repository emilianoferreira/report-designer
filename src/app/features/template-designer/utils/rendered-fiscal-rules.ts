import { CFE_TYPES, FiscalFact, ValidationContext } from '../../../core/models/fiscal.model';
import { ReportTemplate } from '../../../core/models/template.model';
import { RenderEvidence } from '../services/render-evidence';
import { mmToPx } from './coordinate-utils';
import { evaluateStaticFiscalRules, RuleResult, StaticFiscalReport } from './static-fiscal-rules';

export type RenderedFiscalReport = Omit<StaticFiscalReport, 'scope'> & { scope: 'rendered-browser' };
export const fiscalValue = <T>(fact: FiscalFact<T>): T | undefined => fact.state === 'known' ? fact.value : undefined;
const normalize = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleUpperCase('es-UY');

function expectedQr(context: ValidationContext): string | undefined {
  const facts = context.facts;
  const payload = fiscalValue(facts.qrPayload);
  const prefix = 'https://www.efactura.dgi.gub.uy/consultaQR/cfe?';
  if (!payload?.startsWith(prefix)) return undefined;
  const fields = payload.slice(prefix.length).split(',');
  const rut = fiscalValue(facts.issuerRut)?.replace(/\D/g, '');
  const date = fiscalValue(facts.signatureDate)?.slice(0, 10).split('-').reverse().join('/');
  const hash = fiscalValue(facts.signatureHash);
  const amount = fiscalValue(facts.totalPayable);
  const decimal = (value: string) => value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
  if (fields.length !== 7 || !rut || !date || !hash || amount === undefined ||
      fields[0] !== rut || fields[1] !== String(fiscalValue(facts.cfeType)) ||
      fields[2] !== fiscalValue(facts.series) || fields[3] !== fiscalValue(facts.number) ||
      !/^-?\d+(\.\d+)?$/.test(fields[4]) || decimal(fields[4]) !== decimal(amount) ||
      fields[5] !== date || fields[6] !== hash) return undefined;
  return payload;
}

export function inspectFiscalPrint(
  template: ReportTemplate, context: ValidationContext, doc: Document | undefined, evidence: RenderEvidence,
  resourcesReady: boolean
): RenderedFiscalReport {
  const type = fiscalValue(context.facts.cfeType);
  const applicable = fiscalValue(context.facts.isCfe) === true && CFE_TYPES.some(t => t.value === type)
    && !context.diagnostics.length;
  const staticReport = evaluateStaticFiscalRules(template, context);
  const results = staticReport.results.map(result => {
    if (!applicable && result.category === 'normative' && result.status !== 'pending') {
      return { ...result, status: 'pending' as const, message: 'Falta un escenario CFE compatible para esta salida.' };
    }
    return result;
  });
  const update = (id: string, status: RuleResult['status'], message: string, elements: RuleResult['elements'] = []) => {
    const result = results.find(r => r.id === id);
    if (result) Object.assign(result, { status, message, elements });
  };
  const finish = (): RenderedFiscalReport => ({
    ...staticReport, scope: 'rendered-browser', results,
    status: results.some(r => r.status === 'fail') ? 'violations' : 'incomplete'
  });
  update('COB-01', 'pending', applicable
    ? 'Se analiza la salida del navegador. Los controles manuales y externos conservan su estado pendiente.'
    : 'Seleccioná un escenario CFE compatible y resolvé las diferencias de contexto.');
  const page = doc?.querySelector('.page');
  const view = doc?.defaultView;
  if (!applicable || !doc || !page || !view) return finish();
  const rect = page.getBoundingClientRect();
  const epsilon = 0.05; // CSS layout rounding in px, independent of preview zoom.
  const visible = (node: Element) => {
    for (let current: Element | null = node; current; current = current.parentElement) {
      const style = view.getComputedStyle(current);
      if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return false;
    }
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  const contained = (box: DOMRect, outer: DOMRect) => box.left >= outer.left - epsilon &&
    box.top >= outer.top - epsilon && box.right <= outer.right + epsilon && box.bottom <= outer.bottom + epsilon;
  const nodes = Array.from(page.querySelectorAll('[data-render-element], [data-render-generated]')).filter(visible);
  const overlaps = (box: DOMRect, node: Element) => nodes.some(other => {
    if (other === node || other.contains(node) || node.contains(other)) return false;
    const b = other.getBoundingClientRect();
    return b.left < box.right - epsilon && b.right > box.left + epsilon &&
      b.top < box.bottom - epsilon && b.bottom > box.top + epsilon;
  });
  const address = (node: Element): RuleResult['elements'] => {
    const owner = node.closest('[data-render-element]');
    const id = owner?.getAttribute('data-render-element');
    const section = owner?.getAttribute('data-render-section');
    return id && (section === 'header' || section === 'detail' || section === 'footer') ? [{ id, section }] : [];
  };
  const errors = evidence.diagnostics.filter(d => ['resource-error', 'generation-error', 'expression-error'].includes(d.code));
  update('TEC-02', resourcesReady && !errors.length ? 'pass' : 'pending', errors.length
    ? errors.map(d => d.message).join(' ') : resourcesReady ? 'La carga de recursos terminó.' : 'La carga de recursos sigue pendiente.');
  const outside = nodes.some(node => !contained(node.getBoundingClientRect(), rect));
  if (outside || template.sections.pageHeader || template.sections.pageFooter ||
      (!template.page.dynamicHeight && rect.height > mmToPx(template.page.height) + epsilon)) {
    update('EXT-03', 'pending', 'Hay contenido fuera de la superficie de una hoja o secciones repetidas. Revisá la salida multipágina.');
    return finish();
  }
  if (!resourcesReady || errors.some(d => d.code === 'resource-error') || !rect.width || !rect.height) return finish();
  update('TEC-04', 'pass', 'Se inspeccionó la misma superficie que usa el botón Imprimir.');

  const readable = (node: Element) => {
    if (!node.textContent?.trim()) return false;
    if (view.getComputedStyle(node).color === 'rgba(0, 0, 0, 0)') return false;
    const range = doc.createRange();
    range.selectNodeContents(node);
    const bounds = Array.from(range.getClientRects());
    return bounds.length > 0 && bounds.every(b => contained(b, rect) &&
      (!view.getComputedStyle(node).overflow.match(/hidden|clip/) || contained(b, node.getBoundingClientRect())) &&
      !overlaps(b, node));
  };
  const textNodes = nodes.filter(node => node.matches('.element-text,.element-datafield,.element-formula') && readable(node));
  const matchingText = (value: string | undefined) => value && textNodes.find(node => normalize(node.textContent ?? '') === normalize(value));
  const issuer = [context.facts.issuerName, context.facts.issuerTradeName, context.facts.issuerAddress]
    .map(fact => matchingText(fiscalValue(fact)));
  if (issuer.every((node): node is Element => !!node)) update('ID-01', 'pass',
    'Razón social, nombre comercial y domicilio fiscal coinciden con el origen.', issuer.flatMap(address));
  const date = fiscalValue(context.facts.issueDate)?.slice(0, 10);
  const printedDate = matchingText(date) || matchingText(date?.split('-').reverse().join('/'));
  if (printedDate) update('CON-01', 'pass', 'La fecha de emisión visible coincide con el origen.', address(printedDate));
  const regime = fiscalValue(context.facts.issuerRegime);
  const legends = [
    { id: 'REG-01', regime: 'exempt', text: 'Contribuyente Exonerado' },
    { id: 'REG-02', regime: 'vat-minimum', text: 'Contribuyente IVA MINIMO' },
    { id: 'REG-03', regime: 'monotributo', text: 'MONOTRIBUTO' },
    { id: 'REG-04', regime: 'monotributo-mides', text: 'MONOTRIBUTO SOCIAL MIDES' }
  ];
  for (const legend of legends) {
    if (regime && regime !== legend.regime) {
      update(legend.id, 'not-applicable', 'El régimen del comprobante es otro.');
    } else if (regime === legend.regime) {
      const label = matchingText(legend.text);
      const basis = legend.id === 'REG-01' && matchingText(fiscalValue(context.facts.exemptionLegalReference));
      if (label && (legend.id !== 'REG-01' || basis)) update(legend.id, 'pass',
        'Se encontró el texto visible exigido para el régimen.', [...address(label), ...(basis ? address(basis) : [])]);
    }
  }
  const withRole = (node: Element, role: string) => evidence.elements.some(element =>
    element.id === node.getAttribute('data-render-element') && element.roles.includes(role));
  const nonBillable = fiscalValue(context.facts.nonBillableAmount);
  const amountNode = textNodes.find(node => withRole(node, 'totals.non-billable') &&
    node.textContent?.trim() === nonBillable);
  if (amountNode && nonBillable !== undefined) update('CON-05.07', 'pass',
    'El monto no facturable visible coincide con A.129 del origen.', address(amountNode));
  const references = fiscalValue(context.facts.references);
  const reason = references?.length === 1 ? references[0].reason : undefined;
  const reasonNode = reason && textNodes.find(node => withRole(node, 'reference.reason') &&
    normalize(node.textContent ?? '') === normalize(reason));
  if (reasonNode) update('REF-03.02', 'pass', 'La razón visible de la única referencia coincide con F.6.', address(reasonNode));

  const qrNodes = Array.from(page.querySelectorAll('svg[data-qr-modules]')).filter(visible);
  const otherGraphics = Array.from(page.querySelectorAll('img, canvas, object, svg:not([data-qr-modules])')).some(visible) ||
    Array.from(page.querySelectorAll('*')).some(node => visible(node) && view.getComputedStyle(node).backgroundImage !== 'none');
  const expected = expectedQr(context);
  if (qrNodes.length === 0 && !otherGraphics && !errors.length && expected) {
    update('QR-01', 'fail', 'La salida del CFE no contiene un símbolo QR ni un recurso gráfico que pueda contenerlo.');
  }
  if (qrNodes.length !== 1) return finish();
  const qr = qrNodes[0];
  const owner = qr.closest('[data-render-element]');
  const box = qr.getBoundingClientRect();
  if (!owner || !contained(box, owner.getBoundingClientRect()) || !contained(box, rect) || overlaps(box, owner)) return finish();
  const ink = qr.querySelector('path');
  const background = qr.querySelector('rect');
  if (!ink || !background || view.getComputedStyle(ink).fill !== 'rgb(0, 0, 0)' ||
      view.getComputedStyle(background).fill !== 'rgb(255, 255, 255)') return finish();
  const target = address(qr);
  const actual = evidence.qrPayloads?.filter(entry => entry.elementId === target[0]?.id) ?? [];
  if (actual.length !== 1 || !expected) return finish();
  if (actual[0].payload !== expected) {
    if (!otherGraphics) update('QR-03', 'fail', 'El único QR generado codifica un valor distinto del contenido de consulta informado por el origen.', target);
    return finish();
  }
  update('QR-01', 'pass', 'Hay un símbolo generado con el contenido de consulta del origen.', target);
  update('QR-03', 'pass', 'El contenido codificado coincide con el valor de consulta informado por el origen.', target);
  const shortCode = fiscalValue(context.facts.signatureHash)?.slice(0, 6);
  const printedCode = shortCode?.length === 6 ? matchingText(shortCode) : undefined;
  if (printedCode && printedCode.getBoundingClientRect().top >= box.bottom - epsilon) {
    update('QR-04', 'pass', 'Los seis caracteres del hash se ven debajo del QR.', [...target, ...address(printedCode)]);
  }
  const modules = Number(qr.getAttribute('data-qr-modules'));
  const quiet = Number(qr.getAttribute('data-qr-quiet-modules'));
  if (modules > 0 && quiet > 0) {
    const scale = Math.min(box.width, box.height) / (modules + 2 * quiet) / mmToPx(1);
    const size = scale * modules;
    const margin = scale * quiet;
    const tolerance = epsilon / mmToPx(1);
    const measurement = `Símbolo de ${size.toFixed(2)} mm y margen de ${margin.toFixed(2)} mm por lado.`;
    if ((size < 22 - tolerance || size > 30 + tolerance || margin < 3 - tolerance || margin > 5 + tolerance) && !otherGraphics) {
      update('QR-02', 'fail', measurement + ' La medida queda fuera de los límites del catálogo.', target);
    } else {
      const endpoint = [[22, 3], [30, 5]].some(([s, m]) => Math.abs(size - s) <= tolerance && Math.abs(margin - m) <= tolerance);
      update('QR-02', endpoint ? 'pass' : 'pending', measurement + (endpoint ? '' : ' Requiere revisión del par de medidas.'), target);
    }
  }
  return finish();
}

export function confirmedPrintFailures(report: RenderedFiscalReport): RuleResult[] {
  return report.results.filter(result => result.category === 'normative' && result.status === 'fail');
}
