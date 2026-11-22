import { CFE_TYPES, FiscalRole, ValidationContext } from '../../../core/models/fiscal.model';
import { LayoutContent, LayoutEvidence } from '../../../core/models/layout-evidence.model';
import { ReportTemplate } from '../../../core/models/template.model';
import { RuleResult } from './static-fiscal-rules';
import { CFE_FORMAT_SOURCE } from './fiscal-rule-catalogue';
import { detectContentConflicts } from '../../../shared/utils/content-overlap';
import { mmToPx, pxToMm } from './coordinate-utils';
import { supportsFiscalBrowserRules } from './fiscal-context';
import { isAdendaContent } from './receiver-adenda';

/** Only explicit relative constraints. Logical zones never imply coordinates. */
export function evaluateFiscalPlacement(template: ReportTemplate, context: ValidationContext, layout: LayoutEvidence,
  doc: Document, paginationPending?: string, verifiedQrElementIds: string[] = []): RuleResult[] {
  const results: RuleResult[] = [];
  const known = supportsFiscalBrowserRules(context) &&
    !context.diagnostics.some(d => d.kind === 'profile-mismatch');
  if (!known || !layout.ready) return results;
  const conflicts = detectContentConflicts(layout);
  const usable = (c: LayoutContent) => c.certainty === 'measured' && !c.clipped &&
    !conflicts.some(f => f.contentIds.includes(c.instanceId));
  const roles = (role: FiscalRole, page: number) => layout.content.filter(c => c.page === page && c.roles.includes(role) &&
    c.kind !== 'decoration' && usable(c));
  const textOf = (c: LayoutContent) => Array.from(doc.querySelectorAll('body > .page')[c.page - 1]?.querySelectorAll('[data-render-element]') ?? [])
    .find(node => node.getAttribute('data-render-element') === c.elementId)?.textContent?.trim();
  const verifiedValue = (c: LayoutContent) => {
    const fields = { 'issuer.name': context.facts.issuerName, 'issuer.rut': context.facts.issuerRut,
      'issuer.trade-name': context.facts.issuerTradeName, 'issuer.address': context.facts.issuerAddress,
      'recipient.name': context.facts.receiverName, 'recipient.document': context.facts.receiverDocumentNumber,
      'footer.cae': context.facts.caeNumber, 'footer.cae-expiry': context.facts.caeExpiryDate,
      'document.series': context.facts.series, 'document.number': context.facts.number };
    if (c.roles.includes('security.code') && context.facts.signatureHash.state === 'known') return textOf(c) === context.facts.signatureHash.value.slice(0, 6);
    const cfeType = context.facts.cfeType.state === 'known' ? context.facts.cfeType.value : undefined;
    if (c.roles.includes('document.type')) return textOf(c) === CFE_TYPES.find(type => type.value === cfeType)?.label;
    return Object.entries(fields).some(([role, fact]) => c.roles.includes(role) && fact.state === 'known' && textOf(c) === String(fact.value));
  };
  const add = (id: string, title: string, page: number, status: RuleResult['status'], message: string,
    content: LayoutContent[], reference: string) => {
    const elements: RuleResult['elements'] = [];
    content.forEach(c => {
      if (c.elementId && (c.section === 'header' || c.section === 'detail' || c.section === 'footer') && !elements.some(e => e.id === c.elementId))
        elements.push({ id: c.elementId, section: c.section });
    });
    results.push({ id, ruleId: id, findingId: `${id}:page:${page}`, page, title, status,
      severity: status === 'fail' ? 'error' : 'info', category: 'normative', output: 'browser',
      message: `Página ${page}. ${message}`, action: 'Revisar los roles, el contexto y la disposición de esta salida sin mover elementos automáticamente.',
      source: CFE_FORMAT_SOURCE, reference, evidenceIds: content.map(c => c.instanceId), elements });
  };
  const pages = Array.from(doc.querySelectorAll('body > .page'));
  for (let number = 1; number <= pages.length; number++) {
    for (const [rule, orderedRoles] of [
      ['POS-ISSUER-ORDER', ['issuer.name', 'issuer.trade-name', 'issuer.address']],
      ['POS-DOCUMENT-ORDER', ['issuer.rut', 'document.type', 'document.series', 'document.number']]
    ] as Array<[string, FiscalRole[]]>) {
      const ordered = orderedRoles.map(role => roles(role, number).filter(c => verifiedValue({ ...c, roles: [role] })));
      // Missing or compound fields cannot establish an inversion. Equal printed values are interchangeable evidence.
      for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
        if (ordered[i].length !== 1 || ordered[j].length !== 1) continue;
        const a = ordered[i][0], b = ordered[j][0];
        if (a.elementId === b.elementId || textOf(a) === textOf(b)) continue;
        const above = b.bounds.y + b.bounds.height < a.bounds.y - 0.05;
        if (above) add(`${rule}-${i}-${j}`, 'Orden interno de identificación', number, 'fail',
          `El dato ${orderedRoles[j]} está completamente por encima de ${orderedRoles[i]}, con valores y roles verificados.`, [a, b], 'p. 80, Identificación del emisor y del comprobante');
      }
    }
    const qr = roles('security.qr', number).filter(c => c.kind === 'graphic');
    const code = roles('security.code', number).filter(c => c.kind === 'text');
    if (qr.length === 1 && code.length === 1 && qr[0].elementId && verifiedQrElementIds.includes(qr[0].elementId) && context.facts.signatureHash.state === 'known') {
      // A semantic role alone never proves that the printed code is the security code.
      const codeElement = Array.from(pages[number - 1].querySelectorAll('[data-render-element]'))
        .find(n => n.getAttribute('data-render-element') === code[0].elementId);
      if (codeElement?.textContent?.trim() === context.facts.signatureHash.value.slice(0, 6)) {
        const below = code[0].bounds.y >= qr[0].bounds.y + qr[0].bounds.height - 0.05;
        add('POS-QR-CODE', 'Código debajo del QR', number, below ? 'pass' : 'fail',
          `Código en y=${pxToMm(code[0].bounds.y).toFixed(2)} mm; debe verse debajo del QR identificado.`, [...qr, ...code], 'p. 83, Sello digital');
      }
    }
    const cae = roles('footer.cae', number), range = roles('footer.cae-range', number);
    if (cae.length === 1 && range.length === 1 && range[0].bounds.y + range[0].bounds.height < cae[0].bounds.y - 0.05) {
      add('POS-CAE-RANGE', 'Rango del CAE', number, 'pending', 'El rango identificado está por encima del CAE; confirmar asociación y contenido antes de declarar incumplimiento.', [...cae, ...range], 'p. 83, Serie y número inicial y final del CAE');
    }
    if (pages.length > 1) {
      const identityRoles: FiscalRole[] = ['issuer.name', 'issuer.rut', 'recipient.name', 'recipient.document', 'document.type', 'document.series', 'document.number'];
      const identity = identityRoles.flatMap(role => roles(role, number));
      const label = pages[number - 1].querySelector('[data-render-page-label]');
      const numbered = label?.textContent?.trim() === `Página ${number} de ${pages.length}`;
      // Repetition is not a full content certificate. Missing roles can conceal valid composites or preprinted data.
      add('POS-MULTIPAGE', 'Identificación y numeración por hoja', number, 'pending',
        `${numbered ? 'Numeración coherente.' : 'No se pudo confirmar la numeración.'} ${identityRoles.every(role => roles(role, number).length > 0) ? 'Se identificaron roles de cabecera y receptor.' : 'Identificación repetida incompleta o no verificable.'} Falta verificar valores, excepciones y sello completo.`, identity, 'p. 79, Impresión en varias hojas');
      if (number < pages.length) {
        const footer = (['footer.cae', 'footer.cae-range', 'footer.cae-expiry', 'footer.issuer-start', 'footer.verification', 'footer.iva-legend'] as FiscalRole[])
          .flatMap(role => roles(role, number));
        if (footer.length) add('POS-LAST-FOOTER', 'Datos del pie en hoja intermedia', number, 'pending',
          'Hay roles de pie fuera de la última hoja. Confirmar contenido y asociación fiscal antes de declarar incumplimiento.', footer, 'p. 79, Impresión en varias hojas');
      }
    }
    const frames = layout.content.filter(c => c.page === number && c.kind === 'decoration' && c.roles.includes('adenda.boundary'));
    const adenda = layout.content.filter(c => c.page === number && c.kind !== 'decoration' && usable(c) && isAdendaContent(c, frames));
    const fiscal = layout.content.filter(c => c.page === number && c.zones.length && !isAdendaContent(c, frames) && c.kind !== 'decoration' && usable(c));
    if (adenda.length && template.compliance?.adendaPlacement === 'after-cfe' && fiscal.length) {
      const misplaced = adenda.filter(a => fiscal.some(f => a.bounds.y + a.bounds.height < f.bounds.y - 0.05));
      if (misplaced.length) add('POS-ADENDA-AFTER', 'Orden de adenda después del CFE', number, 'pending',
        'La alternativa declarada es después del CFE, pero hay adenda por encima de datos fiscales. Comprobar si corresponde la alternativa dentro del cuerpo antes de declarar incumplimiento.', [...misplaced, ...fiscal], 'p. 84, Adenda');
    }
    if (adenda.length && template.compliance?.adendaPlacement === 'separate-page' && fiscal.length) {
      add('POS-ADENDA-SEPARATE', 'Hoja separada de adenda', number, 'pending',
        'La alternativa declarada es hoja separada; esta hoja contiene adenda y datos fiscales. Revisar las otras alternativas admitidas.', [...adenda, ...fiscal], 'p. 84, Adenda');
    }
    if (template.compliance?.adendaPlacement === 'within-body') {
      const boundary = frames.filter(usable);
      if (boundary.length === 1) {
        const frame = boundary[0];
        const element = (['header', 'detail', 'footer'] as const).flatMap(s => template.sections[s].elements).find(e => e.id === frame.elementId);
        if (element?.type === 'rectangle' && element.shapeType === 'rectangle' && element.strokeColor && element.strokeWidth &&
            fiscal.some(f => f.bounds.y > frame.bounds.y + frame.bounds.height &&
              f.roles.some(role => ['security.code', 'footer.cae', 'footer.cae-expiry'].includes(role) && verifiedValue({ ...f, roles: [role] }))) &&
            adenda.some(a => a.roles.includes('adenda.label') && textOf(a) === 'ADENDA') &&
            adenda.some(a => a.roles.includes('adenda.content')) &&
            adenda.every(a => a.bounds.x >= frame.bounds.x && a.bounds.y >= frame.bounds.y &&
              a.bounds.x + a.bounds.width <= frame.bounds.x + frame.bounds.width && a.bounds.y + a.bounds.height <= frame.bounds.y + frame.bounds.height)) {
          const margin = mmToPx(5);
          const close = fiscal.filter(f => verifiedValue(f) && f.ink.some(ink => {
            const dx = Math.max(frame.bounds.x - ink.x - ink.width, ink.x - frame.bounds.x - frame.bounds.width, 0);
            const dy = Math.max(frame.bounds.y - ink.y - ink.height, ink.y - frame.bounds.y - frame.bounds.height, 0);
            return (dx === 0 || dy === 0) && Math.max(dx, dy) < margin - 0.05;
          }));
          const secrecy = context.facts.professionalSecrecy;
          const review = secrecy.state === 'conflict' || (secrecy.state === 'known' && secrecy.value);
          if (close.length) add('POS-ADENDA-MARGIN', 'Separación de adenda en el cuerpo', number, review ? 'pending' : 'fail',
            'Se midió tinta de datos fiscales a menos de 5 mm del recuadro de adenda identificado.' +
              (review ? ' Falta resolver la ubicación alternativa de la identificación del receptor.' : ''), [frame, ...close], 'p. 84, Adenda');
        }
      }
    }
  }
  if (paginationPending || template.sections.pageHeader || template.sections.pageFooter || template.sections.detail.groupBy) {
    add('POS-PAGINATION', 'Paginación no verificable', 1, 'pending', paginationPending ?? 'La estructura repetida o agrupada requiere revisión.', [], 'p. 79, Impresión en varias hojas');
  }
  add('POS-DISTRIBUTION', 'Distribución y alternativas', 1, 'pending',
    'No se imponen porcentajes de página para ángulos o sectores. La distribución alternativa secuencial y sus condiciones requieren confirmar la organización del comprobante.', [], 'pp. 79–83, Orden de información y bloques');
  if (layout.content.some(c => c.zones.includes('adenda'))) add('POS-ADENDA', 'Adenda independiente del pie fiscal', 1, 'pending',
    'Se identificó adenda. Confirmar delimitación y modo: hoja separada, después del CFE o dentro del cuerpo con separación de 5 mm. El rol no determina cuál alternativa se utiliza.', [], 'p. 84, Adenda');
  return results;
}
