import { ValidationContext } from '../../../core/models/fiscal.model';
import { LayoutContent, LayoutEvidence } from '../../../core/models/layout-evidence.model';
import { ReportTemplate } from '../../../core/models/template.model';
import { detectContentConflicts, intersection } from '../../../shared/utils/content-overlap';
import { RenderEvidence } from '../services/render-evidence';
import { mmToPx } from './coordinate-utils';
import { fiscalFieldFact, ReceiverPageCoverage } from './fiscal-field-evidence';
import { hasPlainPrintedText, observePrintedFields } from './printed-field-observations';
import { hasUninterpretedGeneratedContent, hasUninterpretedPrintStyles } from './receiver-page-coverage';
import { borderFitsBrowserPage } from './print-border';
import { adendaAmendmentPublished, RECEIVER_SOURCE, ReceiverRequirements } from './receiver-requirements';
import type { RuleResult } from './static-fiscal-rules';

const bottom = (box: LayoutContent['bounds']) => box.y + box.height;
const right = (box: LayoutContent['bounds']) => box.x + box.width;

export function isAdendaContent(item: LayoutContent, frames: readonly LayoutContent[]): boolean {
  return item.zones.includes('adenda') || frames.some(frame => frame.page === item.page && !!intersection(frame.bounds, item.bounds));
}

const cfeIdentityRoles = { issuerRut: 'issuer.rut', series: 'document.series', number: 'document.number' } as const;

export function verifiedCfeIdentity(context: ValidationContext, doc: Document | undefined,
  evidence: RenderEvidence, layout: LayoutEvidence | undefined, paginationPending?: string): LayoutContent[] {
  const frames = layout?.content.filter(item => item.kind === 'decoration' && item.roles.includes('adenda.boundary')) ?? [];
  return observePrintedFields(doc, evidence, layout, paginationPending).flatMap(({ field, node, content }) => {
    const path = field.fiscalPath;
    if (path !== 'issuerRut' && path !== 'series' && path !== 'number') return [];
    const role = cfeIdentityRoles[path];
    if (!role || field.presentation !== 'raw' || !content.every(item => item.roles.includes(role) && !isAdendaContent(item, frames))) return [];
    const expected = fiscalFieldFact(context, path);
    return expected.state === 'known' && node.textContent?.trim() === String(expected.value) ? content : [];
  });
}

export function evaluateReceiverAdenda(template: ReportTemplate, requirements: ReceiverRequirements,
  doc: Document | undefined, layout: LayoutEvidence | undefined, coverage: readonly ReceiverPageCoverage[], cfeIdentity: readonly LayoutContent[],
  paginationPending?: string): RuleResult[] {
  if (requirements.secrecy !== true || requirements.branch === 'unresolved') return [];
  const fields = requirements.fields.filter(field => field.applicability === 'required' && field.field);
  const basis = fields[0]?.locationBasis;
  const add = (message: string, status: 'pass' | 'pending' = 'pending', page?: number, evidenceIds: string[] = []): RuleResult[] => [{
    id: 'REC-SECRECY', ruleId: 'REC-SECRECY', findingId: `REC-SECRECY:location:${page ?? 'document'}`, page,
    title: 'Ubicación del receptor con secreto profesional', status, severity: 'info', category: 'normative', output: 'browser',
    source: basis?.source ?? RECEIVER_SOURCE, reference: basis?.reference ?? '13º.J y 14º, identificación del receptor y adenda',
    message, action: 'Revisar la ubicación y la delimitación de la identificación.', elements: [], evidenceIds
  }];
  if (!doc?.defaultView || !layout?.ready || paginationPending || !basis || !fields.length ||
      fields.some(field => !field.expected || !field.locationBasis || !field.locations.includes('adenda')) || hasUninterpretedPrintStyles(doc))
    return add('Falta evidencia del receptor, de la vigencia de la excepción o de la superficie del navegador.');

  const conflicts = new Set(detectContentConflicts(layout).flatMap(conflict => conflict.contentIds));
  const usable = (item: LayoutContent) => item.certainty === 'measured' && !item.clipped && item.ink.length > 0 && !conflicts.has(item.instanceId);
  const pages = Array.from(doc.querySelectorAll('body > .page'));
  const frames = layout.content.filter(item => item.kind === 'decoration' && item.roles.includes('adenda.boundary'));
  const byId = new Map(layout.content.map(item => [item.instanceId, item]));
  const requiredOn = (page: number, accept: (item: LayoutContent) => boolean) => fields.map(field => {
    const ids = coverage.find(record => record.role === field.role && record.page === page && record.inspected)?.evidenceIds ?? [];
    return ids.map(id => byId.get(id)).filter((item): item is LayoutContent => !!item && usable(item)).filter(accept);
  });
  // A verified page-local scalar is required for each datum. Do not combine halves of two alternatives.
  for (const [index, root] of pages.entries()) {
    const page = index + 1;
    const inHeader = requiredOn(page, item => item.section === 'header' && !isAdendaContent(item, frames) &&
      !!item.elementId && Array.from(root.querySelectorAll(':scope > .section-header [data-render-element]'))
        .some(node => node.getAttribute('data-render-element') === item.elementId));
    if (inHeader.every(matches => matches.length)) return add('Se localizaron los datos de identificación en la cabecera del navegador. El recuadro, la altura física y la repetición por hoja se evalúan por separado.',
      'pass', page, inHeader.flat().map(item => item.instanceId));
  }

  if (basis.effectiveFrom !== adendaAmendmentPublished)
    return add('El traslado a adenda estaba previsto para la fecha del CFE. Falta verificar los requisitos históricos de delimitación y precedencia.');
  const placement = template.compliance?.adendaPlacement;
  if (placement !== 'within-body' && placement !== 'separate-page')
    return add('No se pudo comprobar una adenda delimitada en el cuerpo o en hoja separada. La alternativa posterior al CFE requiere verificar dónde termina el comprobante.');
  if (frames.length !== 1 || frames[0].certainty !== 'measured' || conflicts.has(frames[0].instanceId))
    return add('Falta un único recuadro de adenda identificable y medible.');
  const frame = frames[0], root = pages[frame.page - 1];
  const nodes = Array.from(root.querySelectorAll('[data-render-element]'));
  const nodeFor = (item: LayoutContent) => nodes.find(node => node.getAttribute('data-render-element') === item.elementId);
  const frameNode = nodeFor(frame);
  const style = frameNode && doc.defaultView.getComputedStyle(frameNode);
  const sides = ['top', 'right', 'bottom', 'left'];
  if (!frameNode || !style || parseFloat(style.borderRadius) !== 0 || !sides.every(side =>
      style.getPropertyValue(`border-${side}-style`) === 'solid' && parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0 &&
      /^rgb\(/.test(style.getPropertyValue(`border-${side}-color`))))
    return add('La delimitación visible de la adenda requiere revisión.', 'pending', frame.page);
  const view = doc.defaultView;
  if (!borderFitsBrowserPage(frameNode, root, view, template.page.dynamicHeight ? undefined : mmToPx(template.page.height)))
    return add('El recuadro de adenda queda fuera de la página o recortado por un contenedor.', 'pending', frame.page);
  const border = (side: string) => parseFloat(style.getPropertyValue(`border-${side}-width`));
  const inside = (item: LayoutContent) => item.bounds.x >= frame.bounds.x + border('left') &&
    item.bounds.y >= frame.bounds.y + border('top') &&
    right(item.bounds) <= right(frame.bounds) - border('right') && bottom(item.bounds) <= bottom(frame.bounds) - border('bottom');
  const content = layout.content.filter(item => item.page === frame.page && item.kind !== 'decoration');
  const measuredQr = new Set(content.filter(item => item.kind === 'graphic' && usable(item) && item.roles.includes('security.qr'))
    .map(item => nodeFor(item)?.querySelector(':scope > svg[data-qr-modules]')).filter(Boolean));
  if ([root, ...Array.from(root.querySelectorAll('*'))].some(node => {
    const css = view.getComputedStyle(node);
    // Generated QR geometry can establish separation from the adenda without
    // interpreting the QR payload as receiver information.
    if (measuredQr.has(node)) return false;
    return node.getClientRects().length > 0 && css.visibility === 'visible' && Number(css.opacity) !== 0 &&
      hasUninterpretedGeneratedContent(node, view, css);
  })) return add('Hay contenido gráfico o generado cuya ubicación o precedencia no se puede verificar.', 'pending', frame.page);

  const inner = content.filter(inside);
  const labels = inner.filter(item => item.roles.includes('adenda.label'));
  const label = labels[0], labelNode = label && nodeFor(label);
  const receiver = requiredOn(frame.page, inside);
  const receiverIds = new Set(receiver.flat().map(item => item.instanceId));
  const regular = (item: LayoutContent) => !receiverIds.has(item.instanceId) &&
    item.roles.includes('adenda.content') && !item.roles.includes('adenda.mandatory');
  if (labels.length !== 1 || !labelNode || !hasPlainPrintedText(labelNode) || labelNode.textContent?.trim() !== 'ADENDA' ||
      !inner.every(item => usable(item) && item.kind === 'text') || receiver.some(matches => !matches.length) ||
      inner.some(item => item !== label && (item.bounds.y < bottom(label.bounds) ||
        (!receiverIds.has(item.instanceId) && !regular(item) && !item.roles.includes('adenda.mandatory')))) ||
      inner.filter(regular).some(item => receiver.flat().some(datum => item.bounds.y < bottom(datum.bounds))))
    return add('Falta confirmar el rótulo inicial, los datos del receptor o su precedencia sobre el contenido libre de la adenda.', 'pending', frame.page);

  const outside = content.filter(item => !inside(item));
  if (placement === 'separate-page') {
    const otherCfePage = cfeIdentity.some(item => item.page !== frame.page);
    if (outside.length || !otherCfePage)
      return add('No se pudo identificar la adenda como una hoja separada del CFE.', 'pending', frame.page);
  } else {
    const bounds = root.getBoundingClientRect(), margin = mmToPx(5);
    const fits = frame.bounds.x >= margin && frame.bounds.y >= margin &&
      right(frame.bounds) <= bounds.width - margin && bottom(frame.bounds) <= bounds.height - margin;
    const near = outside.some(item => !usable(item) || item.ink.some(ink =>
      right(ink) > frame.bounds.x - margin && ink.x < right(frame.bounds) + margin &&
      bottom(ink) > frame.bounds.y - margin && ink.y < bottom(frame.bounds) + margin));
    if (!fits || near || !frameNode?.closest('.section-detail') ||
        !cfeIdentity.some(item => item.page === frame.page))
      return add('Falta comprobar la separación de la adenda respecto de los bordes y los datos del CFE.', 'pending', frame.page);
  }
  return add('Identificación localizada en la adenda medida, después de su rótulo y antes del contenido libre. Altura física y repetición por hoja pendientes.',
    'pass', frame.page, [frame.instanceId, label.instanceId, ...receiverIds]);
}
